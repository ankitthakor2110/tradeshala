import type { MarketData, StockGainerLoser } from "@/types/database";
import { MOVERS_BASKET } from "./instruments";
import { searchInstruments, resolveEquityKey } from "./upstox-instruments";

const UPSTOX_BASE = "https://api.upstox.com/v2";

// Indices use name-based instrument keys; everything else is an ISIN-based
// equity key resolved via the instrument master.
const INDEX_INSTRUMENT_KEYS: Record<string, string> = {
  NIFTY: "NSE_INDEX|Nifty 50",
  "NIFTY 50": "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  "BANK NIFTY": "NSE_INDEX|Nifty Bank",
  FINNIFTY: "NSE_INDEX|Nifty Fin Service",
  SENSEX: "BSE_INDEX|SENSEX",
};
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

  // Resolve the instrument key: indices use name keys; equities are ISIN-based
  // (Upstox rejects NSE_EQ|<symbol>), so resolve via the instrument master.
  const indexKey = INDEX_INSTRUMENT_KEYS[symbol.toUpperCase()];
  const instrumentKey = indexKey ?? (await resolveEquityKey(symbol));
  if (!instrumentKey) return null;
  const exchange = instrumentKey.startsWith("BSE") ? "BSE" : "NSE";

  try {
    // Full quote gives ohlc + net_change, so change/change% are accurate even
    // after hours (the LTP endpoint omits previous close).
    const res = await fetch(
      `${UPSTOX_BASE}/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey)}`,
      { headers }
    );

    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;

    const data = await res.json();
    // Single instrument requested → take the one entry (response is keyed by
    // EXCHANGE:TRADINGSYMBOL, which differs from the ISIN key we sent).
    const entries = data?.data ? Object.values(data.data as Record<string, unknown>) : [];
    const raw = entries[0] as Record<string, unknown> | undefined;
    if (!raw) return null;

    const ohlc = (raw.ohlc as Record<string, number> | undefined) ?? {};
    const lastPrice = (raw.last_price as number) ?? 0;
    const netChange = (raw.net_change as number) ?? 0;
    const prevClose = lastPrice - netChange;
    const changePct = prevClose ? (netChange / prevClose) * 100 : 0;

    const result: MarketData = {
      symbol, exchange, last_price: lastPrice,
      open_price: ohlc.open ?? 0, high_price: ohlc.high ?? 0,
      low_price: ohlc.low ?? 0, close_price: prevClose,
      change: netChange, change_percent: changePct,
      volume: (raw.volume as number) ?? 0, last_updated: new Date().toISOString(),
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
  sensex: MarketData | null;
} | null> {
  const cacheKey = "upstox:indices";
  const cached = getCached<{ nifty50: MarketData | null; bankNifty: MarketData | null; sensex: MarketData | null }>(cacheKey);
  if (cached) return cached;

  const headers = getHeaders();
  if (!headers) return null;

  try {
    const wanted = [
      { key: "NSE_INDEX|Nifty 50", name: "NIFTY 50", exchange: "NSE" },
      { key: "NSE_INDEX|Nifty Bank", name: "BANK NIFTY", exchange: "NSE" },
      { key: "BSE_INDEX|SENSEX", name: "SENSEX", exchange: "BSE" },
    ];
    const keys = wanted.map((w) => encodeURIComponent(w.key)).join(",");

    // Full quote (not LTP) so index change/% are accurate via net_change.
    const res = await fetch(
      `${UPSTOX_BASE}/market-quote/quotes?instrument_key=${keys}`,
      { headers }
    );

    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;

    const data = await res.json();
    const quotes = data?.data as Record<string, Record<string, unknown>> | undefined;
    if (!quotes) return null;

    function buildIndex(raw: Record<string, unknown> | undefined, name: string, exchange: string): MarketData | null {
      if (!raw) return null;
      const ohlc = (raw.ohlc as Record<string, number> | undefined) ?? {};
      const lp = (raw.last_price as number) ?? 0;
      const nc = (raw.net_change as number) ?? 0;
      const prevClose = lp - nc;
      return {
        symbol: name, exchange, last_price: lp,
        open_price: ohlc.open ?? 0, high_price: ohlc.high ?? 0,
        low_price: ohlc.low ?? 0, close_price: prevClose,
        change: nc, change_percent: prevClose ? (nc / prevClose) * 100 : 0,
        volume: (raw.volume as number) ?? 0, last_updated: new Date().toISOString(),
      };
    }

    // Upstox echoes keys in colon form (NSE_INDEX:Nifty 50); match by that.
    const find = (key: string) => quotes[key.replace("|", ":")] ?? quotes[key];

    const result = {
      nifty50: buildIndex(find(wanted[0].key), wanted[0].name, wanted[0].exchange),
      bankNifty: buildIndex(find(wanted[1].key), wanted[1].name, wanted[1].exchange),
      sensex: buildIndex(find(wanted[2].key), wanted[2].name, wanted[2].exchange),
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

  // Upstox has no top-movers endpoint, so we compute movers from a fixed basket
  // of liquid NIFTY constituents using the full-quote endpoint. `net_change` is
  // the day's change (reliable even when the market is closed, unlike deriving
  // it from ohlc.close which equals last_price after hours).
  try {
    const keys = MOVERS_BASKET.map(encodeURIComponent).join(",");
    const res = await fetch(
      `${UPSTOX_BASE}/market-quote/quotes?instrument_key=${keys}`,
      { headers }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const quotes = data?.data as Record<string, Record<string, unknown>> | undefined;
    if (!quotes) return null;

    const movers: { symbol: string; change: number; changePercent: number }[] = [];
    for (const [respKey, raw] of Object.entries(quotes)) {
      // Response keys come back as "NSE_EQ:<TRADINGSYMBOL>".
      const symbol = respKey.split(":")[1] ?? respKey;
      const lastPrice = (raw.last_price as number) ?? 0;
      const netChange = (raw.net_change as number) ?? 0;
      const prevClose = lastPrice - netChange;
      const changePercent = prevClose ? (netChange / prevClose) * 100 : 0;
      if (netChange === 0) continue;
      movers.push({ symbol, change: netChange, changePercent });
    }

    const gainers = movers
      .filter((m) => m.change > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5)
      .map((m) => ({ symbol: m.symbol, change: m.change, changePercent: m.changePercent, isPositive: true }));

    const losers = movers
      .filter((m) => m.change < 0)
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 5)
      .map((m) => ({ symbol: m.symbol, change: Math.abs(m.change), changePercent: Math.abs(m.changePercent), isPositive: false }));

    const result = { gainers, losers };
    setCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

export interface UniverseEntry {
  symbol: string;       // display symbol the UI subscribes by, e.g. "NIFTY 50", "RELIANCE"
  instrumentKey: string; // Upstox instrument key, e.g. "NSE_INDEX|Nifty 50", "NSE_EQ|RELIANCE"
  exchange: string;
}

export interface BatchQuote {
  symbol: string;
  exchange: string;
  ltp: number;
  prev_close: number;
  change: number;
  change_percent: number;
  volume: number;
}

const LTP_MAX_KEYS = 500; // Upstox allows up to 500 instrument keys per request

/**
 * Fetches last-traded prices for many instruments in batched requests.
 * Mirrors the response parsing used by `fetchIndices` (Upstox returns keys
 * with a colon separator, e.g. "NSE_EQ:RELIANCE"). Returns one row per
 * instrument that resolved, keyed by the caller's display `symbol`.
 */
export async function fetchLtpBatch(
  entries: UniverseEntry[]
): Promise<BatchQuote[]> {
  const headers = getHeaders();
  if (!headers || entries.length === 0) return [];

  const out: BatchQuote[] = [];

  for (let i = 0; i < entries.length; i += LTP_MAX_KEYS) {
    const chunk = entries.slice(i, i + LTP_MAX_KEYS);
    const keys = chunk.map((e) => encodeURIComponent(e.instrumentKey)).join(",");

    try {
      // Full quote so change/% are accurate. Equity responses are keyed by
      // trading symbol, not the ISIN key we send, so match by instrument_token.
      const res = await fetch(
        `${UPSTOX_BASE}/market-quote/quotes?instrument_key=${keys}`,
        { headers }
      );
      if (!res.ok) continue;

      const data = await res.json();
      const quotes = data?.data as Record<string, Record<string, unknown>> | undefined;
      if (!quotes) continue;

      const byToken = new Map<string, Record<string, unknown>>();
      for (const raw of Object.values(quotes)) {
        const token = raw.instrument_token as string | undefined;
        if (token) byToken.set(token, raw);
      }

      for (const entry of chunk) {
        const raw =
          byToken.get(entry.instrumentKey) ??
          quotes[entry.instrumentKey.replace("|", ":")] ??
          quotes[entry.instrumentKey];
        if (!raw) continue;

        const ohlc = (raw.ohlc as Record<string, number> | undefined) ?? {};
        const ltp = (raw.last_price as number) ?? 0;
        const netChange = (raw.net_change as number) ?? 0;
        const prevClose = ltp - netChange;

        out.push({
          symbol: entry.symbol,
          exchange: entry.exchange,
          ltp,
          prev_close: prevClose,
          change: netChange,
          change_percent: prevClose ? (netChange / prevClose) * 100 : 0,
          volume: (raw.volume as number) ?? ohlc.volume ?? 0,
        });
      }
    } catch {
      // skip this chunk on transient failure
    }
  }

  return out;
}

export async function searchStocks(
  query: string
): Promise<{ symbol: string; company_name: string; exchange: string; instrument_type: string }[]> {
  // Upstox has no instrument-search endpoint; search the cached instrument
  // master instead. It's a public file, so this works without an access token.
  const results = await searchInstruments(query);
  return results.map((r) => ({
    symbol: r.symbol,
    company_name: r.company_name,
    exchange: r.exchange,
    instrument_type: r.instrument_type,
  }));
}
