// Plain-English insights generated deterministically from the computed signals —
// no LLM call, so they update on every tick, cost nothing, and are fully
// traceable to the numbers on screen. Pure — no DB / env / clock.

import type { Insight, MarketOverview, OiAnalysis, SentimentScore, Verdict } from "@/types/intel";

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
