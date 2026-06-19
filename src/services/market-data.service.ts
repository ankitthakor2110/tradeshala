import type { MarketData, StockGainerLoser, OptionLeg } from "@/types/database";

export interface OptionGreeks {
  ltp: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

interface IndicesResponse {
  nifty50: MarketData | null;
  bankNifty: MarketData | null;
  sensex?: MarketData | null;
  source: string;
  last_updated: string;
}

interface GainersLosersResponse {
  gainers: StockGainerLoser[];
  losers: StockGainerLoser[];
  source: string;
}

interface SearchResult {
  symbol: string;
  company_name: string;
  exchange: string;
  instrument_type: string;
}

/**
 * Asks the server to take a fresh market snapshot (writes `live_quotes`).
 * Called on an interval by `useSnapshotPoller` to keep live prices flowing on
 * the Vercel Hobby plan, where cron is limited to once per day. Returns whether
 * the request succeeded (a throttled "skipped" pass still counts as success).
 */
export async function triggerSnapshotRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/market-data/snapshot/refresh", {
      method: "POST",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getIndicesData(): Promise<IndicesResponse | null> {
  try {
    const res = await fetch("/api/market-data/indices");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getStockQuote(
  symbol: string,
  exchange: string = "NSE"
): Promise<MarketData | null> {
  try {
    const res = await fetch(
      `/api/market-data/quote?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Looks up the live premium (LTP) of a specific option contract from the
 * option chain. Used by the trade engine so option fills price the contract
 * itself, not the underlying spot.
 */
export async function getOptionLtp(
  symbol: string,
  expiry: string | null,
  strike: number | null,
  side: "CE" | "PE"
): Promise<number | null> {
  try {
    if (!expiry || strike == null) return null;
    const res = await fetch(
      `/api/trade/option-chain?symbol=${encodeURIComponent(symbol)}&expiry=${encodeURIComponent(expiry)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const chain: { strike_price: number; ce?: { ltp?: number }; pe?: { ltp?: number } }[] =
      data.chain ?? [];
    const row = chain.find((r) => r.strike_price === strike);
    if (!row) return null;
    const ltp = side === "CE" ? row.ce?.ltp : row.pe?.ltp;
    return typeof ltp === "number" && ltp > 0 ? ltp : null;
  } catch {
    return null;
  }
}

/**
 * Greeks (Δ/Θ/IV) + LTP for a specific option contract, from the option chain.
 * Used to show per-position risk in the detail drawer.
 */
export async function getOptionGreeks(
  symbol: string,
  expiry: string | null,
  strike: number | null,
  side: "CE" | "PE"
): Promise<OptionGreeks | null> {
  try {
    if (!expiry || strike == null) return null;
    const res = await fetch(
      `/api/trade/option-chain?symbol=${encodeURIComponent(symbol)}&expiry=${encodeURIComponent(expiry)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const chain: { strike_price: number; ce?: OptionLeg; pe?: OptionLeg }[] = data.chain ?? [];
    const row = chain.find((r) => r.strike_price === strike);
    const leg = side === "CE" ? row?.ce : row?.pe;
    if (!leg) return null;
    return {
      ltp: leg.ltp ?? 0,
      delta: leg.delta ?? 0,
      gamma: leg.gamma ?? 0,
      theta: leg.theta ?? 0,
      vega: leg.vega ?? 0,
      iv: leg.iv ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getGainersLosers(): Promise<GainersLosersResponse | null> {
  try {
    const res = await fetch("/api/market-data/gainers-losers");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function searchStocks(
  query: string
): Promise<SearchResult[]> {
  try {
    if (!query || query.trim().length < 1) return [];
    const res = await fetch(
      `/api/market-data/search?q=${encodeURIComponent(query.trim())}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function getMultipleStockPrices(
  symbols: string[]
): Promise<MarketData[]> {
  const results = await Promise.allSettled(
    symbols.map((s) => getStockQuote(s))
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<MarketData | null> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value!);
}
