import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export interface Candle {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface CandlesResponse {
  symbol: string;
  interval: string;
  candles: Candle[];
  source: "upstox" | "mock";
}

// Same index keys used by the option-chain route. Equities need ISIN-based keys
// we don't resolve here, so non-index symbols fall back to a mock series.
const INDEX_INSTRUMENT_KEYS: Record<string, string> = {
  NIFTY: "NSE_INDEX|Nifty 50",
  BANKNIFTY: "NSE_INDEX|Nifty Bank",
  FINNIFTY: "NSE_INDEX|Nifty Fin Service",
  SENSEX: "BSE_INDEX|SENSEX",
};

// Upstox accepts "1minute" | "30minute" for intraday candles.
const ALLOWED_INTERVALS = new Set(["1minute", "30minute"]);

async function fetchUpstox(symbol: string, interval: string): Promise<CandlesResponse | null> {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token || token.startsWith("your_")) return null;

  const instrumentKey = INDEX_INSTRUMENT_KEYS[symbol];
  if (!instrumentKey) return null;

  try {
    const res = await fetch(
      `https://api.upstox.com/v2/historical-candle/intraday/${encodeURIComponent(instrumentKey)}/${interval}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Upstox candle row: [timestamp, open, high, low, close, volume, oi]
    const rows: unknown[][] = data?.data?.candles ?? [];
    if (!rows.length) return null;

    // Upstox returns newest-first; chart wants oldest-first.
    const candles: Candle[] = rows
      .map((row) => ({
        t: new Date(row[0] as string).getTime(),
        o: row[1] as number,
        h: row[2] as number,
        l: row[3] as number,
        c: row[4] as number,
        v: (row[5] as number) ?? 0,
      }))
      .sort((a, b) => a.t - b.t);

    return { symbol, interval, candles, source: "upstox" };
  } catch {
    return null;
  }
}

// Plausible intraday random-walk anchored near `base` (the client's live LTP),
// so the chart reads sensibly even without a live provider.
function generateMock(symbol: string, interval: string, base: number): CandlesResponse {
  const anchor = base > 0 ? base : 24000;
  const points = interval === "1minute" ? 75 : 14; // ~ a trading session
  const stepMins = interval === "1minute" ? 1 : 30;
  const now = Date.now();
  const start = now - points * stepMins * 60_000;
  const vol = anchor * 0.0008;

  const candles: Candle[] = [];
  let prevClose = anchor * (1 - (Math.random() * 0.01 - 0.005));
  for (let i = 0; i < points; i++) {
    const drift = (anchor - prevClose) * 0.05; // pull gently toward the live price
    const o = prevClose;
    const c = o + drift + (Math.random() * 2 - 1) * vol;
    const h = Math.max(o, c) + Math.random() * vol;
    const l = Math.min(o, c) - Math.random() * vol;
    candles.push({
      t: start + i * stepMins * 60_000,
      o: Math.round(o * 100) / 100,
      h: Math.round(h * 100) / 100,
      l: Math.round(l * 100) / 100,
      c: Math.round(c * 100) / 100,
      v: Math.round(50_000 + Math.random() * 200_000),
    });
    prevClose = c;
  }
  // Snap the last close to the live price so the chart agrees with the ticker.
  if (base > 0 && candles.length) candles[candles.length - 1].c = Math.round(base * 100) / 100;
  return { symbol, interval, candles, source: "mock" };
}

export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get("symbol")?.toUpperCase();
    const intervalParam = request.nextUrl.searchParams.get("interval") ?? "30minute";
    const interval = ALLOWED_INTERVALS.has(intervalParam) ? intervalParam : "30minute";
    const base = parseFloat(request.nextUrl.searchParams.get("ltp") ?? "0") || 0;

    if (!symbol) {
      return Response.json({ error: "symbol is required" }, { status: 400 });
    }

    const upstox = await fetchUpstox(symbol, interval);
    if (upstox && upstox.candles.length > 0) return Response.json(upstox);

    return Response.json(generateMock(symbol, interval, base));
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
