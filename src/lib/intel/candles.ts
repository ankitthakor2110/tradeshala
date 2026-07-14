// Pure candle-derived analytics for the Market Intelligence Dashboard.
// No DB / env / clock — everything is a function of the passed candle array so
// it is trivially unit-testable (see candles.test.ts). Candles are oldest-first.

import type { Candle } from "@/types/intel";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Session VWAP. Index feeds frequently report 0 volume, so when total volume is
 * absent we fall back to the mean typical price and flag `reliable: false` — the
 * dashboard then labels it as an approximation rather than a true VWAP.
 */
export function deriveVWAP(candles: Candle[]): { vwap: number | null; reliable: boolean } {
  if (!candles.length) return { vwap: null, reliable: false };
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    const tp = (c.h + c.l + c.c) / 3;
    pv += tp * c.v;
    vol += c.v;
  }
  if (vol > 0) return { vwap: round2(pv / vol), reliable: true };
  const mean = candles.reduce((s, c) => s + (c.h + c.l + c.c) / 3, 0) / candles.length;
  return { vwap: round2(mean), reliable: false };
}

/** Average True Range over the last `period` candles (Wilder's TR, simple mean). */
export function deriveATR(candles: Candle[], period = 14): number | null {
  if (candles.length < 2) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c)));
  }
  const n = Math.min(period, trs.length);
  const recent = trs.slice(-n);
  return round2(recent.reduce((s, x) => s + x, 0) / n);
}

export function dayHighLow(candles: Candle[]): { high: number; low: number } | null {
  if (!candles.length) return null;
  let high = -Infinity;
  let low = Infinity;
  for (const c of candles) {
    if (c.h > high) high = c.h;
    if (c.l < low) low = c.l;
  }
  return { high: round2(high), low: round2(low) };
}

/** High/low of the first `minutes` of the session (opening range). */
export function openingRange(
  candles: Candle[],
  minutes = 15
): { high: number; low: number } | null {
  if (!candles.length) return null;
  const cutoff = candles[0].t + minutes * 60_000;
  const window = candles.filter((c) => c.t < cutoff);
  const use = window.length ? window : [candles[0]];
  let high = -Infinity;
  let low = Infinity;
  for (const c of use) {
    if (c.h > high) high = c.h;
    if (c.l < low) low = c.l;
  }
  return { high: round2(high), low: round2(low) };
}

/** Realized range of the session so far (real; not multi-day ADR). */
export function dayRange(candles: Candle[]): number | null {
  const hl = dayHighLow(candles);
  return hl ? round2(hl.high - hl.low) : null;
}

/** Signed % distance of `price` from a reference level. */
export function distancePct(price: number, ref: number | null): number | null {
  if (ref == null || ref === 0) return null;
  return round2(((price - ref) / ref) * 100);
}

/**
 * Directional read from price action + VWAP position. Combines net move over the
 * recent window with above/below VWAP and higher-highs/lower-lows structure into
 * a score in [-100, 100]; confidence is its magnitude.
 */
export function deriveTrend(
  candles: Candle[],
  vwap: number | null
): { trend: "bullish" | "bearish" | "neutral"; confidence: number } {
  if (candles.length < 3) return { trend: "neutral", confidence: 0 };
  const closes = candles.map((c) => c.c);
  const last = closes[closes.length - 1];
  const lookback = Math.min(10, closes.length);
  const first = closes[closes.length - lookback];
  const netPct = first !== 0 ? ((last - first) / first) * 100 : 0;

  let score = clamp(netPct * 25, -45, 45); // ~0.4% move → ~10 pts, capped

  if (vwap != null) score += last > vwap ? 25 : last < vwap ? -25 : 0;

  // Higher-highs / lower-lows over the last few candles.
  const tail = candles.slice(-4);
  if (tail.length >= 3) {
    const risingH = tail.every((c, i) => i === 0 || c.h >= tail[i - 1].h);
    const fallingL = tail.every((c, i) => i === 0 || c.l <= tail[i - 1].l);
    if (risingH) score += 15;
    if (fallingL) score -= 15;
  }

  score = clamp(score, -100, 100);
  const trend = score > 20 ? "bullish" : score < -20 ? "bearish" : "neutral";
  return { trend, confidence: Math.round(Math.abs(score)) };
}
