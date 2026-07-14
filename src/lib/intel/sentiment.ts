// Transparent composite sentiment. Each input becomes a weighted directional
// signal; the signals are pooled into bull/bear/neutral shares that sum to ~100.
// Fully deterministic and explainable (every firing signal contributes a reason).
// Pure — no DB / env / clock. Weights come from INTEL_CONFIG.sentiment.

import type { Bias, SentimentScore } from "@/types/intel";
import { INTEL_CONFIG } from "@/config/intel";

export interface SentimentInputs {
  pcr: number;
  priceVsVwapPct: number | null;
  trend: "bullish" | "bearish" | "neutral";
  trendConfidence: number; // 0-100
  /** Net fresh put- vs call-writing skew in [-1,1] (>0 bullish); null while warming up. */
  oiSkewScore: number | null;
  changePercent: number;
}

interface Signal {
  favor: "bull" | "bear" | "neutral";
  strength: number; // 0..1
  weight: number;
  reason: string;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function biasFromNet(net: number): Bias {
  const { strong, mild } = INTEL_CONFIG.sentiment.bands;
  if (net >= strong) return "strong-bullish";
  if (net >= mild) return "bullish";
  if (net <= -strong) return "strong-bearish";
  if (net <= -mild) return "bearish";
  return "neutral";
}

function buildSignals(inp: SentimentInputs): Signal[] {
  const w = INTEL_CONFIG.sentiment.weights;
  const { pcrBullish, pcrBearish } = INTEL_CONFIG.sentiment;
  const signals: Signal[] = [];

  // PCR — high put OI ⇒ put writers confident ⇒ bullish.
  if (inp.pcr >= pcrBullish) {
    signals.push({
      favor: "bull",
      strength: clamp01((inp.pcr - pcrBullish) / 0.85 + 0.3),
      weight: w.pcr,
      reason: `PCR ${inp.pcr.toFixed(2)} — put writers dominant`,
    });
  } else if (inp.pcr > 0 && inp.pcr <= pcrBearish) {
    signals.push({
      favor: "bear",
      strength: clamp01((pcrBearish - inp.pcr) / 0.6 + 0.3),
      weight: w.pcr,
      reason: `PCR ${inp.pcr.toFixed(2)} — call writers dominant`,
    });
  } else {
    signals.push({ favor: "neutral", strength: 1, weight: w.pcr, reason: "PCR balanced" });
  }

  // Price vs VWAP.
  if (inp.priceVsVwapPct == null || Math.abs(inp.priceVsVwapPct) < 0.02) {
    signals.push({ favor: "neutral", strength: 1, weight: w.vwap, reason: "Price hugging VWAP" });
  } else if (inp.priceVsVwapPct > 0) {
    signals.push({
      favor: "bull",
      strength: clamp01(inp.priceVsVwapPct / 0.3),
      weight: w.vwap,
      reason: "Trading above VWAP",
    });
  } else {
    signals.push({
      favor: "bear",
      strength: clamp01(-inp.priceVsVwapPct / 0.3),
      weight: w.vwap,
      reason: "Trading below VWAP",
    });
  }

  // Trend from price action.
  if (inp.trend === "neutral") {
    signals.push({ favor: "neutral", strength: 1, weight: w.trend, reason: "No clear trend" });
  } else {
    signals.push({
      favor: inp.trend === "bullish" ? "bull" : "bear",
      strength: clamp01(inp.trendConfidence / 100),
      weight: w.trend,
      reason: `Price action trending ${inp.trend}`,
    });
  }

  // OI writing skew (session) — null while warming up.
  if (inp.oiSkewScore == null || Math.abs(inp.oiSkewScore) < 0.05) {
    signals.push({ favor: "neutral", strength: 1, weight: w.oiSkew, reason: "OI flows balanced" });
  } else if (inp.oiSkewScore > 0) {
    signals.push({
      favor: "bull",
      strength: clamp01(Math.abs(inp.oiSkewScore)),
      weight: w.oiSkew,
      reason: "Fresh put writing outpacing calls",
    });
  } else {
    signals.push({
      favor: "bear",
      strength: clamp01(Math.abs(inp.oiSkewScore)),
      weight: w.oiSkew,
      reason: "Fresh call writing outpacing puts",
    });
  }

  // Day momentum.
  if (Math.abs(inp.changePercent) < 0.1) {
    signals.push({ favor: "neutral", strength: 1, weight: w.momentum, reason: "Flat on the day" });
  } else {
    signals.push({
      favor: inp.changePercent > 0 ? "bull" : "bear",
      strength: clamp01(Math.abs(inp.changePercent) / 0.8),
      weight: w.momentum,
      reason: `${inp.changePercent > 0 ? "Up" : "Down"} ${Math.abs(inp.changePercent).toFixed(2)}% on the day`,
    });
  }

  return signals;
}

export function computeSentiment(inp: SentimentInputs): SentimentScore {
  const signals = buildSignals(inp);
  let bullPts = 0;
  let bearPts = 0;
  let totalW = 0;

  // Only the directional portion (weight × strength) of a signal moves bull/bear;
  // neutral signals and the non-directional remainder fall through to `neutral`
  // as 100 − bull − bear, so the three shares always sum to 100.
  for (const s of signals) {
    totalW += s.weight;
    if (s.favor === "bull") bullPts += s.weight * s.strength;
    else if (s.favor === "bear") bearPts += s.weight * s.strength;
  }

  const bull = totalW ? Math.round((bullPts / totalW) * 100) : 0;
  const bear = totalW ? Math.round((bearPts / totalW) * 100) : 0;
  const neutral = Math.max(0, 100 - bull - bear);
  const net = bull - bear;

  // Reasons: directional signals, strongest contribution first.
  const reasons = signals
    .filter((s) => s.favor !== "neutral" && s.strength > 0.15)
    .sort((a, b) => b.weight * b.strength - a.weight * a.strength)
    .map((s) => s.reason);

  return {
    bull,
    bear,
    neutral,
    net,
    overall: biasFromNet(net),
    confidence: Math.min(100, Math.abs(net)),
    reasons: reasons.length ? reasons : ["Signals are mixed — no decisive edge"],
  };
}
