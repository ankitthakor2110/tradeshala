// Plain-English insights generated deterministically from the computed signals —
// no LLM call, so they update on every tick, cost nothing, and are fully
// traceable to the numbers on screen. Pure — no DB / env / clock.

import type {
  ConfidenceMetrics,
  Insight,
  MarketOverview,
  OiAnalysis,
  PremiumBehaviour,
  SentimentScore,
  StrikeMigration,
  Verdict,
  WriterConfidence,
} from "@/types/intel";
import { INTEL_CONFIG } from "@/config/intel";

export interface InsightContext {
  overview: MarketOverview;
  sentiment: SentimentScore;
  oi: OiAnalysis;
  verdict: Verdict;
}

export function buildInsights(ctx: InsightContext): Insight[] {
  const { overview, sentiment, oi, verdict } = ctx;
  const out: Insight[] = [];
  const push = (tone: Insight["tone"], text: string) =>
    out.push({ id: `i${out.length}`, tone, text });

  // Headline read.
  if (verdict.control === "buyers") {
    push("bullish", `Buyers hold the tape — bull score ${sentiment.bull}% vs bear ${sentiment.bear}%.`);
  } else if (verdict.control === "sellers") {
    push("bearish", `Sellers hold the tape — bear score ${sentiment.bear}% vs bull ${sentiment.bull}%.`);
  } else {
    push("neutral", `No side in control — bull ${sentiment.bull}% / bear ${sentiment.bear}%. Wait for a break.`);
  }

  // VWAP.
  if (overview.vwap != null) {
    if (overview.ltp > overview.vwap) {
      push("bullish", `Momentum favours longs while price holds above VWAP (${overview.vwap}).`);
    } else if (overview.ltp < overview.vwap) {
      push("bearish", `Price is below VWAP (${overview.vwap}) — rallies are sell-the-pop until reclaimed.`);
    }
    if (!overview.vwapReliable) {
      push("warning", "VWAP is an approximation — index candles report no volume this session.");
    }
  }

  // OI walls.
  push(
    "neutral",
    `Put writers are defending ${oi.support} (support); call writers cap ${oi.resistance} (resistance). Max pain ${oi.maxPain}.`
  );
  if (oi.pcr >= 1.15) {
    push("bullish", `PCR ${oi.pcr.toFixed(2)} — aggressive put writing signals underlying support.`);
  } else if (oi.pcr > 0 && oi.pcr <= 0.8) {
    push("bearish", `PCR ${oi.pcr.toFixed(2)} — heavy call writing is capping upside.`);
  }

  // Trap / structure warning.
  if (verdict.trap && verdict.trapNote) {
    push("warning", verdict.trapNote);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Extra institutional-style insights from the AI decision-engine layer. Kept
// separate from buildInsights (which existing tests pin) — the hook concatenates
// both into state.insights. Each line is traceable to a number on screen.
// ---------------------------------------------------------------------------

export interface ExtraInsightContext {
  writers: WriterConfidence | null;
  premium: PremiumBehaviour | null;
  migration: StrikeMigration | null;
  confidence: ConfidenceMetrics | null;
  oi: OiAnalysis;
}

export function generateExtraInsights(ctx: ExtraInsightContext): Insight[] {
  const out: Insight[] = [];
  const push = (tone: Insight["tone"], text: string) => out.push({ id: `x${out.length}`, tone, text });

  const { writers, premium, migration, confidence, oi } = ctx;

  if (writers && !writers.insufficient && writers.winner && writers.winner !== "balanced") {
    if (writers.winner === "put") {
      push("bullish", `Put writers continue defending ${oi.support} — ${writers.reason.toLowerCase()}.`);
    } else {
      push("bearish", `Call writers are capping ${oi.resistance} — ${writers.reason.toLowerCase()}.`);
    }
  }

  if (premium && !premium.insufficient && premium.tone !== "neutral") {
    push(premium.tone, `Premium behaviour: ${premium.interpretation}.`);
  }

  if (migration && !migration.insufficient && migration.tone !== "neutral") {
    const parts: string[] = [];
    if (migration.supportShift !== "none") parts.push(`support ${migration.prevSupport}→${migration.currSupport}`);
    if (migration.resistanceShift !== "none")
      parts.push(`resistance ${migration.prevResistance}→${migration.currResistance}`);
    push(migration.tone, `${migration.interpretation}${parts.length ? ` (${parts.join(", ")})` : ""}.`);
  }

  if (confidence?.breakoutProbability != null && confidence.breakoutProbability >= 60) {
    push("bullish", `High breakout probability (${confidence.breakoutProbability}%) if the trigger gives way.`);
  }
  if (confidence?.falseBreakoutRisk != null && confidence.falseBreakoutRisk >= 60) {
    push("warning", `Elevated false-breakout risk (${confidence.falseBreakoutRisk}%) — wait for confirmation.`);
  }

  // Ensure the panel is never empty when nothing notable fired.
  if (!out.length) push("neutral", INTEL_CONFIG.insufficientData);

  return out;
}
