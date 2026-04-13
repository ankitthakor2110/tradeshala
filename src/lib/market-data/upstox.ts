import type { MarketData, StockGainerLoser } from "@/types/database";

const UPSTOX_BASE = "https://api.upstox.com/v2";
const CACHE_TTL = 5000;

interface CacheEntry<T> { data: T; timestamp: number }
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.timestamp > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function getHeaders(): Record<string, string> | null {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token || token.startsWith("your_")) return null;
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

export function isUpstoxConfigured(): boolean {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  return !!(token && !token.startsWith("your_"));
}

export interface UpstoxHealthResult {
  status: "ok" | "error";
  message: string;
  tokenExpired: boolean;
  hint: string;
}

export async function testConnection(): Promise<UpstoxHealthResult> {
  if (!isUpstoxConfigured()) {
    return {
      status: "error",
      message: "Upstox credentials not configured",
      tokenExpired: false,
      hint: "Add UPSTOX_ACCESS_TOKEN to your environment variables",
    };
  }

  const headers = getHeaders();
  if (!headers) {
    return {
      status: "error",
      message: "Upstox credentials not configured",
      tokenExpired: false,
      hint: "Add UPSTOX_ACCESS_TOKEN to your environment variables",
    };
  }

  try {
    const res = await fetch(`${UPSTOX_BASE}/user/profile`, { headers });

    if (res.ok) {
      return { status: "ok", message: "Upstox connected", tokenExpired: false, hint: "" };
    }

    if (res.status === 401) {
      return {
        status: "error",
        message: "Upstox token expired. Please regenerate.",
        tokenExpired: true,
        hint: "Upstox tokens expire daily at midnight IST. Generate a new one from the Upstox Developer Console.",
      };
    }

    if (res.status === 403) {
      return {
        status: "error",
        message: "Upstox access denied. Check API key.",
        tokenExpired: false,
        hint: "Verify your Upstox API key has the required permissions",
      };
    }

    if (res.status === 429) {
      return {
        status: "error",
        message: "Upstox rate limit exceeded",
        tokenExpired: false,
        hint: "Wait a few minutes and try again",
      };
    }

    return {
      status: "error",
      message: `Upstox returned ${res.status}`,
      tokenExpired: false,
      hint: "Check Upstox status page for outages",
    };
  } catch (e) {
    return {
      status: "error",
      message: `Cannot reach Upstox: ${(e as Error).message}`,
      tokenExpired: false,
      hint: "Check your internet connection or Upstox may be down",
    };
  }
}

export async function fetchQuote(symbol: string): Promise<MarketData | null> {
  const cacheKey = `upstox:quote:${symbol}`;
  const cached = getCached<MarketData>(cacheKey);
  if (cached) return cached;

  const headers = getHeaders();
  if (!headers) return null;

  try {
    const instrumentKey = `NSE_EQ|${symbol}`;
    const res = await fetch(
      `${UPSTOX_BASE}/market-quote/ltp?instrument_key=${encodeURIComponent(instrumentKey)}`,
      { headers }
    );

    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;

    const data = await res.json();
    // Upstox returns keys with colon separator: NSE_EQ:SYMBOL
    const responseKey = `NSE_EQ:${symbol}`;
    const quote = data?.data?.[responseKey] ?? data?.data?.[instrumentKey];
    if (!quote) return null;

    const lastPrice = quote.last_price ?? 0;
    const closePrice = quote.close_price ?? 0;
    const change = lastPrice - closePrice;
    const changePct = closePrice ? (change / closePrice) * 100 : 0;

    const result: MarketData = {
      symbol, exchange: "NSE", last_price: lastPrice,
      open_price: quote.open_price ?? 0, high_price: quote.high_price ?? 0,
      low_price: quote.low_price ?? 0, close_price: closePrice,
      change, change_percent: changePct,
      volume: quote.volume ?? 0, last_updated: new Date().toISOString(),
    };

    setCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

export async function fetchIndices(): Promise<{
  nifty50: MarketData | null;
  bankNifty: MarketData | null;
} | null> {
  const cacheKey = "upstox:indices";
  const cached = getCached<{ nifty50: MarketData | null; bankNifty: MarketData | null }>(cacheKey);
  if (cached) return cached;

  const headers = getHeaders();
  if (!headers) return null;

  try {
    const niftyInstrument = "NSE_INDEX|Nifty 50";
    const bankInstrument = "NSE_INDEX|Nifty Bank";
    const keys = [niftyInstrument, bankInstrument].map(encodeURIComponent).join(",");

    const res = await fetch(
      `${UPSTOX_BASE}/market-quote/ltp?instrument_key=${keys}`,
      { headers }
    );

    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;

    const data = await res.json();
    const quotes = data?.data;
    if (!quotes) return null;

    // Upstox returns colon-separated keys: NSE_INDEX:Nifty 50
    const niftyKey = "NSE_INDEX:Nifty 50";
    const bankKey = "NSE_INDEX:Nifty Bank";

    function buildIndex(raw: Record<string, number> | undefined, name: string): MarketData | null {
      if (!raw) return null;
      const lp = raw.last_price ?? 0;
      const cl = raw.close_price ?? 0;
      return {
        symbol: name, exchange: "NSE", last_price: lp,
        open_price: raw.open_price ?? 0, high_price: raw.high_price ?? 0,
        low_price: raw.low_price ?? 0, close_price: cl,
        change: lp - cl, change_percent: cl ? ((lp - cl) / cl) * 100 : 0,
        volume: raw.volume ?? 0, last_updated: new Date().toISOString(),
      };
    }

    const result = {
      nifty50: buildIndex(quotes[niftyKey] ?? quotes[niftyInstrument], "NIFTY 50"),
      bankNifty: buildIndex(quotes[bankKey] ?? quotes[bankInstrument], "BANK NIFTY"),
    };

    setCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

export async function fetchGainersLosers(): Promise<{
  gainers: StockGainerLoser[];
  losers: StockGainerLoser[];
} | null> {
  const cacheKey = "upstox:movers";
  const cached = getCached<{ gainers: StockGainerLoser[]; losers: StockGainerLoser[] }>(cacheKey);
  if (cached) return cached;

  const headers = getHeaders();
  if (!headers) return null;

  try {
    const res = await fetch(
      `${UPSTOX_BASE}/market-quote/market-status/NSE`,
      { headers }
    );

    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;

    const data = await res.json();

    const mapMovers = (items: Record<string, unknown>[], positive: boolean): StockGainerLoser[] =>
      (items ?? []).slice(0, 5).map((item) => ({
        symbol: ((item.symbol as string) ?? "").replace("NSE_EQ|", ""),
        change: Math.abs((item.net_change as number) ?? (item.change as number) ?? 0),
        changePercent: Math.abs((item.percentage_change as number) ?? (item.change_percent as number) ?? 0),
        isPositive: positive,
      }));

    const result = {
      gainers: mapMovers(data?.data?.top_gainers ?? [], true),
      losers: mapMovers(data?.data?.top_losers ?? [], false),
    };

    setCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

export async function searchStocks(
  query: string
): Promise<{ symbol: string; company_name: string; exchange: string; instrument_type: string }[]> {
  const headers = getHeaders();
  if (!headers) return [];

  try {
    const res = await fetch(
      `${UPSTOX_BASE}/search?q=${encodeURIComponent(query)}&exchange=NSE`,
      { headers }
    );

    if (res.status === 401 || res.status === 403) return [];
    if (!res.ok) return [];

    const data = await res.json();

    return (data?.data ?? []).slice(0, 10).map((item: Record<string, unknown>) => ({
      symbol: (item.trading_symbol as string) ?? (item.symbol as string) ?? "",
      company_name: (item.company_name as string) ?? (item.name as string) ?? "",
      exchange: "NSE",
      instrument_type: (item.instrument_type as string) ?? "EQ",
    }));
  } catch {
    return [];
  }
}
