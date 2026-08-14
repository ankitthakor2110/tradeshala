import type { RawEvent } from "@/lib/intel/events";
import type { EventImpact } from "@/types/intel";

// Auto-fetched macro event calendar for the Trade Finder's event-risk gate.
// Source: Financial Modeling Prep (FMP) free-tier economic calendar. We keep the
// events that actually move Indian index options — US prints (FOMC / CPI / NFP)
// and any India/EU high-impact releases — and map them into the pure `RawEvent`
// shape the event engine (src/lib/intel/events.ts) already consumes.
//
// Server-only (reads FMP_API_KEY). Never throws; a missing key or a failed fetch
// reports `unavailable` (honest NO-FEED) rather than fabricating a calendar. The
// weekly F&O expiry is added client-side from the live expiry feed, so the gate
// still works even when this returns nothing.

/** One row of the FMP `/v3/economic_calendar` response (fields we use). */
export interface FmpEconomicEvent {
  date: string; // "YYYY-MM-DD HH:mm:ss" in UTC
  country: string; // ISO-ish, e.g. "US", "IN", "EU"
  event: string; // "Inflation Rate YoY"
  impact?: string; // "Low" | "Medium" | "High" | "None"
  currency?: string;
}

/** Countries whose macro prints meaningfully move NIFTY/BANKNIFTY. */
export const RELEVANT_COUNTRIES = ["US", "IN", "EU"] as const;

const IMPACT_MAP: Record<string, EventImpact> = {
  high: "high",
  medium: "medium",
  low: "low",
  none: "low",
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Parse an FMP UTC datetime ("2026-08-13 12:30:00") into an ISO-8601 instant.
 * FMP omits the timezone; the values are UTC, so we pin `Z`. Returns null for a
 * malformed value so the mapper can drop it rather than emit `Invalid Date`.
 */
export function fmpDateToIso(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw?.trim() ?? "");
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}Z`;
}

/**
 * Pure mapper: FMP rows → `RawEvent[]`, filtered to the relevant countries and
 * to `medium`+ impact (low-impact prints don't gate a scalp). Deterministic and
 * unit-tested; the impure fetch below wraps it.
 */
export function mapFmpEvents(
  rows: FmpEconomicEvent[],
  countries: ReadonlyArray<string> = RELEVANT_COUNTRIES
): RawEvent[] {
  const allow = new Set(countries.map((c) => c.toUpperCase()));
  const out: RawEvent[] = [];
  for (const r of rows) {
    if (!r || typeof r.event !== "string" || !r.event.trim()) continue;
    const country = (r.country ?? "").toUpperCase();
    if (!allow.has(country)) continue;
    const impact = IMPACT_MAP[(r.impact ?? "").toLowerCase()] ?? "low";
    if (impact === "low") continue; // keep only medium/high — these gate entries
    const at = fmpDateToIso(r.date);
    if (!at) continue;
    out.push({
      id: `fmp-${country}-${slug(r.event)}-${r.date.slice(0, 16)}`,
      label: `${country}: ${r.event.trim()}`,
      category: `${country} Macro`,
      impact,
      at,
    });
  }
  return out;
}

export interface EconomicCalendarResult {
  events: RawEvent[];
  source: "fmp" | "unavailable";
  coverageThrough: string | null; // ISO date the fetch window extends to
}

const FMP_URL = "https://financialmodelingprep.com/api/v3/economic_calendar";
const CACHE_TTL_MS = 30 * 60 * 1000; // events change slowly; a 30-min cache is plenty
const HORIZON_DAYS = 4;

const EMPTY: EconomicCalendarResult = { events: [], source: "unavailable", coverageThrough: null };

let cache: { data: EconomicCalendarResult; ts: number } | null = null;

function utcDateOnly(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().split("T")[0];
}

/**
 * Fetch (or serve cached) macro events from FMP. Never throws: no key or any
 * failure yields `unavailable` (serving the last good cache if we have one).
 */
export async function fetchEconomicCalendar(): Promise<EconomicCalendarResult> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;

  const key = process.env.FMP_API_KEY;
  if (!key) return cache?.data ?? EMPTY;

  const from = utcDateOnly(0);
  const to = utcDateOnly(HORIZON_DAYS);

  try {
    const res = await fetch(`${FMP_URL}?from=${from}&to=${to}&apikey=${key}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return cache?.data ?? EMPTY;

    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) return cache?.data ?? EMPTY;

    const events = mapFmpEvents(json as FmpEconomicEvent[]);
    const data: EconomicCalendarResult = { events, source: "fmp", coverageThrough: to };
    cache = { data, ts: Date.now() };
    return data;
  } catch {
    return cache?.data ?? EMPTY;
  }
}
