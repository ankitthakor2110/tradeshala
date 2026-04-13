import type { MarketData, StockGainerLoser } from "@/types/database";

const DHAN_BASE = "https://api.dhan.co/v2";
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
  const token = process.env.DHAN_ACCESS_TOKEN;
  const clientId = process.env.DHAN_CLIENT_ID;
  if (!token || !clientId || token.startsWith("your_") || clientId.startsWith("your_")) return null;
  return {
    "access-token": token,
    "client-id": clientId,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = 1
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, options);

    // Rate limited — wait and retry
    if (res.status === 429 && i < retries) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    // Service unavailable — retry once after 2s
    if (res.status === 503 && i < retries) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    // Don't retry on auth errors
    if (res.status === 401) return res;

    return res;
  }

  return fetch(url, options);
}

export function isDhanConfigured(): boolean {
  const token = process.env.DHAN_ACCESS_TOKEN;
  const clientId = process.env.DHAN_CLIENT_ID;
  return !!(token && clientId && !token.startsWith("your_") && !clientId.startsWith("your_"));
}

export interface DhanHealthResult {
  status: "ok" | "error";
  message: string;
  hint: string;
}

export async function testConnection(): Promise<DhanHealthResult> {
  if (!isDhanConfigured()) {
    return {
      status: "error",
      message: "DhanHQ credentials not configured",
      hint: "Add DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN to your environment variables",
    };
  }

  const headers = getHeaders();
  if (!headers) {
    return {
      status: "error",
      message: "DhanHQ credentials not configured",
      hint: "Add DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN to your environment variables",
    };
  }

  try {
    const res = await fetch(`${DHAN_BASE}/fundlimit`, { headers });

    if (res.ok) {
      return { status: "ok", message: "DhanHQ connected", hint: "" };
    }

    if (res.status === 400 || res.status === 401) {
      const body = await res.text().catch(() => "");
      const isInvalidToken = body.includes("DH-906") || body.includes("Invalid Token");
      return {
        status: "error",
        message: isInvalidToken
          ? "DhanHQ token expired or invalid"
          : "Invalid DhanHQ credentials",
        hint: isInvalidToken
          ? "Generate a new access token from the Dhan developer portal"
          : "Check your DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN values",
      };
    }

    if (res.status === 429) {
      return {
        status: "error",
        message: "DhanHQ rate limit exceeded",
        hint: "Wait a few minutes and try again",
      };
    }

    if (res.status === 503) {
      return {
        status: "error",
        message: "DhanHQ service temporarily unavailable",
        hint: "DhanHQ may be under maintenance. Try again later.",
      };
    }

    return {
      status: "error",
      message: `DhanHQ returned ${res.status}`,
      hint: "Check DhanHQ status page for outages",
    };
  } catch (e) {
    return {
      status: "error",
      message: `Cannot reach DhanHQ: ${(e as Error).message}`,
      hint: "Check your internet connection or DhanHQ may be down",
    };
  }
}

export async function fetchQuote(symbol: string): Promise<MarketData | null> {
  const cacheKey = `dhan:quote:${symbol}`;
  const cached = getCached<MarketData>(cacheKey);
  if (cached) return cached;

  const headers = getHeaders();
  if (!headers) return null;

  try {
    const res = await fetchWithRetry(`${DHAN_BASE}/marketfeed/ltp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ NSE_EQ: [symbol] }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const quote = data?.data?.NSE_EQ?.[symbol];
    if (!quote) return null;

    const lastPrice = quote.last_price ?? 0;
    const closePrice = quote.close ?? 0;
    const change = lastPrice - closePrice;
    const changePct = closePrice ? (change / closePrice) * 100 : 0;

    const result: MarketData = {
      symbol,
      exchange: "NSE",
      last_price: lastPrice,
      open_price: quote.open ?? 0,
      high_price: quote.high ?? 0,
      low_price: quote.low ?? 0,
      close_price: closePrice,
      change,
      change_percent: changePct,
      volume: quote.volume ?? 0,
      last_updated: new Date().toISOString(),
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
  const cacheKey = "dhan:indices";
  const cached = getCached<{ nifty50: MarketData | null; bankNifty: MarketData | null }>(cacheKey);
  if (cached) return cached;

  const headers = getHeaders();
  if (!headers) return null;

  try {
    const res = await fetchWithRetry(`${DHAN_BASE}/marketfeed/ltp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ NSE_INDEX: ["NIFTY", "BANKNIFTY"] }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const indices = data?.data?.NSE_INDEX;
    if (!indices) return null;

    function buildIndex(raw: Record<string, number> | undefined, name: string): MarketData | null {
      if (!raw) return null;
      const lp = raw.last_price ?? 0;
      const cl = raw.close ?? 0;
      return {
        symbol: name, exchange: "NSE", last_price: lp,
        open_price: raw.open ?? 0, high_price: raw.high ?? 0,
        low_price: raw.low ?? 0, close_price: cl,
        change: lp - cl, change_percent: cl ? ((lp - cl) / cl) * 100 : 0,
        volume: raw.volume ?? 0, last_updated: new Date().toISOString(),
      };
    }

    const result = {
      nifty50: buildIndex(indices["NIFTY"], "NIFTY 50"),
      bankNifty: buildIndex(indices["BANKNIFTY"], "BANK NIFTY"),
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
  const cacheKey = "dhan:movers";
  const cached = getCached<{ gainers: StockGainerLoser[]; losers: StockGainerLoser[] }>(cacheKey);
  if (cached) return cached;

  const headers = getHeaders();
  if (!headers) return null;

  try {
    const [gainRes, loseRes] = await Promise.all([
      fetchWithRetry(`${DHAN_BASE}/marketfeed/top-gainers?exchangeSegment=NSE_EQ&count=5`, { headers }),
      fetchWithRetry(`${DHAN_BASE}/marketfeed/top-losers?exchangeSegment=NSE_EQ&count=5`, { headers }),
    ]);

    if (!gainRes.ok || !loseRes.ok) return null;

    const gainData = await gainRes.json();
    const loseData = await loseRes.json();

    const mapMovers = (items: Record<string, unknown>[], positive: boolean): StockGainerLoser[] =>
      (items ?? []).slice(0, 5).map((item) => ({
        symbol: (item.tradingSymbol as string) ?? (item.symbol as string) ?? "",
        change: Math.abs((item.change as number) ?? 0),
        changePercent: Math.abs((item.percentChange as number) ?? (item.changePercent as number) ?? 0),
        isPositive: positive,
      }));

    const result = {
      gainers: mapMovers(gainData?.data ?? [], true),
      losers: mapMovers(loseData?.data ?? [], false),
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
    const res = await fetchWithRetry(
      `${DHAN_BASE}/search?q=${encodeURIComponent(query)}&count=10`,
      { headers }
    );

    if (!res.ok) return [];
    const data = await res.json();

    return (data?.data ?? [])
      .filter(
        (item: Record<string, unknown>) =>
          (item.exchangeSegment as string) === "NSE_EQ" || (item.exchange as string) === "NSE"
      )
      .slice(0, 10)
      .map((item: Record<string, unknown>) => ({
        symbol: (item.tradingSymbol as string) ?? (item.symbol as string) ?? "",
        company_name: (item.securityName as string) ?? (item.companyName as string) ?? "",
        exchange: "NSE",
        instrument_type: (item.instrumentType as string) ?? "EQ",
      }));
  } catch {
    return [];
  }
}
