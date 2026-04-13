import type { MarketData, StockGainerLoser } from "@/types/database";

interface IndicesResponse {
  nifty50: MarketData | null;
  bankNifty: MarketData | null;
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
