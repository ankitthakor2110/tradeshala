// The combined "Market Intelligence Score" (0-100, 50 = neutral) plus the graded
// Confidence Engine (breakout / trend / false-breakout / reversal probabilities).
// Every factor is a real, fed signal; breadth & full Greeks are surfaced as
// unavailable (weight excluded) rather than faked. Pure — no DB / env / clock.

import type {
  ConfidenceMetrics,
  InsightTone,
  IntelligenceScore,
  ScoreFactor,
} from "@/types/intel";
import { INTEL_CONFIG } from "@/config/intel";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const toneContribution = (tone: InsightTone): number =>
  tone === "bullish" ? 0.8 : tone === "bearish" ? -0.8 : 0;

export interface ScoreContext {
  premiumTone: InsightTone;
  premiumAvailable: boolean;
  pcr: number;
  oiSkewScore: number | null; // fresh writing + OI change (session)
  ceVolume: number;
  peVolume: number;
  migrationTone: InsightTone;
  migrationAvailable: boolean;
  trend: "bullish" | "bearish" | "neutral";
  trendConfidence: number; // 0-100
  atmCeIv: number | null;
  atmPeIv: number | null;
  changePercent: number;
  distanceFromVwapPct: number | null;
}

export function calculateIntelligenceScore(ctx: ScoreContext): IntelligenceScore {
  const cfg = INTEL_CONFIG.intelligenceScore;
  const w = cfg.weights;
  const { pcrBullish, pcrBearish } = INTEL_CONFIG.sentiment;

  // PCR → tilt in [-1,1].
  let pcrTilt = 0;
  if (ctx.pcr >= pcrBullish) pcrTilt = clamp((ctx.pcr - pcrBullish) / 0.85 + 0.3, 0, 1);
  else if (ctx.pcr > 0 && ctx.pcr <= pcrBearish) pcrTilt = -clamp((pcrBearish - ctx.pcr) / 0.6 + 0.3, 0, 1);

  // Volume confirms the move only when the dominant leg matches direction.
  const totalVol = ctx.ceVolume + ctx.peVolume;
  const volSkew = totalVol > 0 ? (ctx.ceVolume - ctx.peVolume) / totalVol : 0;
  let volContribution = 0;
  if (ctx.changePercent > 0.05 && volSkew > 0) volContribution = clamp(volSkew, 0, 1);
  else if (ctx.changePercent < -0.05 && volSkew < 0) volContribution = -clamp(-volSkew, 0, 1);

  // IV skew: richer calls (vs puts) = upside demand (mild bullish); richer puts = fear.
  let ivContribution = 0;
  let ivAvailable = false;
  if (ctx.atmCeIv != null && ctx.atmPeIv != null && ctx.atmCeIv > 0 && ctx.atmPeIv > 0) {
    ivAvailable = true;
    const mid = (ctx.atmCeIv + ctx.atmPeIv) / 2;
    ivContribution = clamp((ctx.atmCeIv - ctx.atmPeIv) / mid / 0.1, -1, 1);
  }

  const trendContribution =
    ctx.trend === "bullish"
      ? ctx.trendConfidence / 100
      : ctx.trend === "bearish"
        ? -ctx.trendConfidence / 100
        : 0;

  const priceActionContribution =
    clamp(ctx.changePercent / 0.5, -1, 1) * 0.6 +
    clamp((ctx.distanceFromVwapPct ?? 0) / 0.3, -1, 1) * 0.4;

  // Fresh writing + OI change come from the same session-OI source; combine their
  // weights into one factor to avoid double-counting the same number.
  const oiFlowWeight = w.oiChange + w.freshWriting;

  interface WeightedFactor extends ScoreFactor {
    weight: number;
  }

  const factors: WeightedFactor[] = [
    { key: "premium", label: "Premium behaviour", weight: w.premium, contribution: toneContribution(ctx.premiumTone), available: ctx.premiumAvailable, detail: ctx.premiumTone },
    { key: "pcr", label: "PCR", weight: w.pcr, contribution: pcrTilt, available: true, detail: `PCR ${ctx.pcr.toFixed(2)}` },
    { key: "oiFlow", label: "OI change / fresh writing", weight: oiFlowWeight, contribution: clamp(ctx.oiSkewScore ?? 0, -1, 1), available: ctx.oiSkewScore != null, detail: ctx.oiSkewScore == null ? "warming up" : "session skew" },
    { key: "volume", label: "Volume", weight: w.volume, contribution: volContribution, available: totalVol > 0, detail: "CE vs PE volume" },
    { key: "migration", label: "Strike migration", weight: w.migration, contribution: toneContribution(ctx.migrationTone), available: ctx.migrationAvailable, detail: "defended-level shift" },
    { key: "priceTrend", label: "Price trend", weight: w.priceTrend, contribution: trendContribution, available: true, detail: `trend ${ctx.trend}` },
    { key: "iv", label: "IV skew", weight: w.iv, contribution: ivContribution, available: ivAvailable, detail: "ATM CE vs PE IV" },
    { key: "priceAction", label: "Price action", weight: w.priceAction, contribution: clamp(priceActionContribution, -1, 1), available: true, detail: "day move + VWAP" },
    // Requested but not fed — shown so the omission is explicit, never scored.
    { key: "breadth", label: "Market breadth", weight: 0, contribution: 0, available: false, detail: "no feed" },
    { key: "greeks", label: "Greeks", weight: 0, contribution: 0, available: false, detail: "only IV is fed" },
  ];

  let num = 0;
  let den = 0;
  for (const f of factors) {
    if (!f.available || f.weight <= 0) continue;
    num += f.contribution * f.weight;
    den += f.weight;
  }
  const net = den > 0 ? num / den : 0; // -1..1
  const score = clamp(Math.round(50 + net * 50), 0, 100);

  const dist = score - 50;
  const { extreme, strong, mild } = cfg.bands;
  const B = cfg.labels.bands;
  let label: string = B.neutral;
  let tone: InsightTone = "neutral";
  if (dist >= extreme) {
    label = B.extremeBull;
    tone = "bullish";
  } else if (dist >= strong) {
    label = B.strongBull;
    tone = "bullish";
  } else if (dist >= mild) {
    label = B.bull;
    tone = "bullish";
  } else if (dist <= -extreme) {
    label = B.strongBear;
    tone = "bearish";
  } else if (dist <= -strong) {
    label = B.strongBear;
    tone = "bearish";
  } else if (dist <= -mild) {
    label = B.bear;
    tone = "bearish";
  }

  // Strip the internal `weight` from the returned factors (type is ScoreFactor).
  const outFactors: ScoreFactor[] = factors.map((f) => ({
    key: f.key,
    label: f.label,
    contribution: Math.round(f.contribution * 100) / 100,
    detail: f.detail,
    available: f.available,
  }));

  return { score, label, tone, factors: outFactors };
}

export interface ConfidenceContext {
  writerConfidence: number | null; // winning writer side's confidence
  setupConfidence: number | null; // top setup confidence (already threshold-filtered)
  trend: "bullish" | "bearish" | "neutral";
  trendConfidence: number;
  trap: boolean;
  distanceToTriggerAtr: number | null; // |ltp - trigger| / atr for the top setup
  oiSkewScore: number | null;
  changePercent: number;
  eventGate: "ok" | "caution" | "avoid" | null;
  atExtreme: boolean; // price pinned at day high/low
}

export function calculateConfidenceMetrics(ctx: ConfidenceContext): ConfidenceMetrics {
  const trendStrength = ctx.trend === "neutral" ? 0 : Math.round(ctx.trendConfidence);

  let breakoutProbability: number | null = null;
  if (ctx.setupConfidence != null) {
    let p = 0.6 * ctx.setupConfidence + 0.4 * trendStrength;
    // Further from the trigger ⇒ lower immediate breakout odds.
    if (ctx.distanceToTriggerAtr != null) p -= clamp(ctx.distanceToTriggerAtr, 0, 2) * 10;
    breakoutProbability = clamp(Math.round(p), 0, 100);
  }

  // False-breakout risk stacks trap, event windows and extreme-tags.
  let fbr = 15;
  if (ctx.trap) fbr += 40;
  if (ctx.eventGate === "avoid") fbr += 30;
  else if (ctx.eventGate === "caution") fbr += 15;
  if (ctx.atExtreme) fbr += 20;
  if (Math.abs(ctx.changePercent) < 0.1) fbr += 10; // no momentum behind the move
  const falseBreakoutRisk = clamp(Math.round(fbr), 0, 100);

  // Reversal risk: trap + tested extreme + OI flow fighting the price move.
  let rev = 10;
  if (ctx.trap) rev += 35;
  if (ctx.atExtreme) rev += 25;
  if (ctx.oiSkewScore != null) {
    const priceUp = ctx.changePercent > 0.1;
    const priceDown = ctx.changePercent < -0.1;
    if ((priceUp && ctx.oiSkewScore < -0.1) || (priceDown && ctx.oiSkewScore > 0.1)) rev += 25;
  }
  const reversalProbability = clamp(Math.round(rev), 0, 100);

  return {
    writerConfidence: ctx.writerConfidence,
    breakoutProbability,
    trendStrength,
    falseBreakoutRisk,
    reversalProbability,
  };
}
