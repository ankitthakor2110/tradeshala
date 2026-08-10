import type { MarketData } from "@/types/database";
import type {
  ScreenerRow,
  ScreenerSortKey,
  SortDir,
  ScreenerFilters,
} from "@/types/finder";
import { equityConviction } from "./rank";

// Pure screener logic — no DB/env/clock, fully unit-tested. Derives per-row
// signals from a live quote and ranks/filters the scan set. All display
// formatting stays in the component; this is math only.

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Where the last price sits inside the session range, 0 (at the low) → 1 (at the
 * high). Null when the range is degenerate (no high/low yet, or high === low),
 * so the UI can show "—" rather than a fabricated midpoint.
 */
export function dayRangePosition(m: MarketData): number | null {
  const { high_price: hi, low_price: lo, last_price: ltp } = m;
  if (!(hi > 0) || !(lo > 0) || hi <= lo) return null;
  const pos = (ltp - lo) / (hi - lo);
  // Clamp: a late print can nudge LTP a hair outside the session range.
  return round2(Math.min(1, Math.max(0, pos)));
}

/**
 * Gap % of the open versus the previous close (`close_price` on the quote is the
 * prior session close). Null when either price is missing.
 */
export function gapPercent(m: MarketData): number | null {
  const { open_price: open, close_price: prevClose } = m;
  if (!(open > 0) || !(prevClose > 0)) return null;
  return round2(((open - prevClose) / prevClose) * 100);
}

export type MomentumTag = "strong-up" | "up" | "flat" | "down" | "strong-down";

/** Coarse momentum bucket from the provider's % change. */
export function momentumTag(changePercent: number): MomentumTag {
  if (changePercent >= 2) return "strong-up";
  if (changePercent > 0.1) return "up";
  if (changePercent <= -2) return "strong-down";
  if (changePercent < -0.1) return "down";
  return "flat";
}

export interface RowSignals {
  dayRangePos: number | null;
  gapPct: number | null;
  momentum: MomentumTag;
}

export function deriveRowSignals(m: MarketData): RowSignals {
  return {
    dayRangePos: dayRangePosition(m),
    gapPct: gapPercent(m),
    momentum: momentumTag(m.change_percent),
  };
}

/** The numeric value a sort key reads from a row. */
function sortValue(m: MarketData, key: ScreenerSortKey): number | string {
  switch (key) {
    case "symbol":
      return m.symbol;
    case "ltp":
      return m.last_price;
    case "changePercent":
      return m.change_percent;
    case "volume":
      return m.volume;
    case "dayRange":
      // Rows with no valid range sort to the bottom regardless of direction.
      return dayRangePosition(m) ?? -1;
    case "conviction":
      return equityConviction(m).score;
  }
}

/** Returns a new, sorted array; does not mutate the input. */
export function rankRows(
  rows: ScreenerRow[],
  key: ScreenerSortKey,
  dir: SortDir
): ScreenerRow[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (typeof va === "string" || typeof vb === "string") {
      return String(va).localeCompare(String(vb)) * mult;
    }
    return (va - vb) * mult;
  });
}

/**
 * Apply the active preset + noise floor. `watchlist` is a set of symbols the
 * user is watching (empty set ⇒ the watchlist preset yields no rows).
 */
export function applyFilters(
  rows: ScreenerRow[],
  filters: ScreenerFilters,
  watchlist: Set<string>
): ScreenerRow[] {
  const floor = Math.max(0, filters.minAbsChangePct);
  let out = rows.filter((r) => Math.abs(r.change_percent) >= floor);

  switch (filters.preset) {
    case "gainers":
      out = out.filter((r) => r.change_percent > 0);
      break;
    case "losers":
      out = out.filter((r) => r.change_percent < 0);
      break;
    case "watchlist":
      out = out.filter((r) => watchlist.has(r.symbol));
      break;
    case "highVolume":
    case "all":
    default:
      break;
  }
  return out;
}

/**
 * Effective sort for a preset: gainers/losers/high-volume carry their own
 * natural ordering, otherwise the caller's explicit sort is used.
 */
export function effectiveSort(
  filters: ScreenerFilters,
  key: ScreenerSortKey,
  dir: SortDir
): { key: ScreenerSortKey; dir: SortDir } {
  switch (filters.preset) {
    case "best":
      return { key: "conviction", dir: "desc" };
    case "gainers":
      return { key: "changePercent", dir: "desc" };
    case "losers":
      return { key: "changePercent", dir: "asc" };
    case "highVolume":
      return { key: "volume", dir: "desc" };
    default:
      return { key, dir };
  }
}

/** Full pipeline: filter, then rank with the preset-aware effective sort. */
export function buildScreenerView(
  rows: ScreenerRow[],
  filters: ScreenerFilters,
  key: ScreenerSortKey,
  dir: SortDir,
  watchlist: Set<string>
): ScreenerRow[] {
  const filtered = applyFilters(rows, filters, watchlist);
  const s = effectiveSort(filters, key, dir);
  return rankRows(filtered, s.key, s.dir);
}
