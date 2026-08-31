import type { MarketData } from "./database";
import type { RawEvent } from "@/lib/intel/events";

// Types for the Trade Finder / Screener (`/dashboard/finder`). The screener is a
// multi-symbol momentum scanner built entirely on real provider quotes — every
// row is a live `MarketData` snapshot; nothing is fabricated. Derived columns
// (day-range position, gap) are computed by the pure `src/lib/finder/*` logic.

/** A single screener row is just a live provider quote for one symbol. */
export type ScreenerRow = MarketData;

/** Shape returned by `/api/market-data/screener`. */
export interface ScreenerResponse {
  rows: ScreenerRow[];
  source: "dhan" | "upstox" | "unavailable";
  last_updated: string;
}

/** Columns the table can sort by. */
export type ScreenerSortKey =
  | "symbol"
  | "changePercent"
  | "ltp"
  | "volume"
  | "dayRange"
  | "conviction";

export type SortDir = "asc" | "desc";

/** Named filter presets surfaced as chips in the filter bar. */
export type ScreenerPreset =
  | "all"
  | "best"
  | "gainers"
  | "losers"
  | "highVolume"
  | "unusualVolume"
  | "watchlist";

export interface ScreenerFilters {
  preset: ScreenerPreset;
  /** Minimum absolute % change to include a row (noise floor). */
  minAbsChangePct: number;
}

// --- Large Deals (NSE bulk / block / short deals) ---------------------------
// Exchange-reported large transactions — real "who's trading" flow, not derived.

export type DealSide = "BUY" | "SELL";
export type DealType = "bulk" | "block" | "short";

export interface LargeDeal {
  symbol: string;
  name: string;
  clientName: string;
  side: DealSide | null;
  qty: number;
  /** Weighted-average trade price (NSE `watp`); null when not reported. */
  watp: number | null;
  /** As reported by NSE, e.g. "07-Aug-2026". */
  date: string;
  dealType: DealType;
}

export interface LargeDealsResponse {
  deals: LargeDeal[];
  /** NSE `as_on_date` for the batch. */
  asOn: string | null;
  source: "nse" | "unavailable";
}

// --- Economic calendar (auto-fetched macro events for the event-risk gate) ---

/** Shape returned by `/api/market-data/economic-calendar` (FMP-sourced). */
export interface EconomicCalendarResponse {
  events: RawEvent[];
  source: "fmp" | "unavailable";
  coverageThrough: string | null;
}
