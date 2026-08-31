import type {
  ScreenerResponse,
  LargeDealsResponse,
  EconomicCalendarResponse,
} from "@/types/finder";
import type { FinderAlert } from "@/lib/finder/alerts";

/**
 * Client-side reader for the Trade Finder screener. Thin `fetch` wrapper around
 * `/api/market-data/screener` (the server does the provider I/O); fails soft to
 * null so the hook can show the empty/unavailable state rather than throw.
 */
export async function getScreener(): Promise<ScreenerResponse | null> {
  try {
    const res = await fetch("/api/market-data/screener");
    if (!res.ok) {
      // 503 (no provider) still carries a well-formed body worth surfacing.
      if (res.status === 503) {
        try {
          return (await res.json()) as ScreenerResponse;
        } catch {
          return null;
        }
      }
      return null;
    }
    return (await res.json()) as ScreenerResponse;
  } catch {
    return null;
  }
}

/** NSE bulk/block/short deals. Fails soft to null (empty/unavailable state). */
export async function getLargeDeals(): Promise<LargeDealsResponse | null> {
  try {
    const res = await fetch("/api/market-data/large-deals");
    if (!res.ok) {
      if (res.status === 503) {
        try {
          return (await res.json()) as LargeDealsResponse;
        } catch {
          return null;
        }
      }
      return null;
    }
    return (await res.json()) as LargeDealsResponse;
  } catch {
    return null;
  }
}

/** Auto-fetched macro event calendar (FMP). Fails soft to an unavailable shape. */
export async function getEconomicCalendar(): Promise<EconomicCalendarResponse> {
  try {
    const res = await fetch("/api/market-data/economic-calendar");
    if (!res.ok) return { events: [], source: "unavailable", coverageThrough: null };
    return (await res.json()) as EconomicCalendarResponse;
  } catch {
    return { events: [], source: "unavailable", coverageThrough: null };
  }
}

/** Nearest option expiry ("YYYY-MM-DD") for a symbol, or null. Never throws. */
export async function getNearestExpiry(symbol: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/trade/expiries?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { expiries?: string[] };
    return json.expiries?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Post the movers crossing the alert threshold to the server, which applies the
 * shared cooldown and sends a Telegram message. Fire-and-forget; never throws.
 */
export async function postFinderAlerts(candidates: FinderAlert[]): Promise<void> {
  if (candidates.length === 0) return;
  try {
    await fetch("/api/finder/alerts/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates }),
    });
  } catch {
    /* alerts are best-effort */
  }
}
