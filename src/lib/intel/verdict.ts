// The "10-second answer" that headlines the dashboard: who's in control, how
// confident, and whether price and positioning agree (trap detection). Composes
// the sentiment read with the raw price/OI context. Pure — no DB / env / clock.

import type { MarketOverview, SentimentScore, Verdict } from "@/types/intel";

export interface VerdictContext {
  sentiment: SentimentScore;
  overview: MarketOverview;
  support: number;
  resistance: number;
}

function controlOf(net: number): Verdict["control"] {
  if (net > 10) return "buyers";
  if (net < -10) return "sellers";
  return "balanced";
}

export function buildVerdict(ctx: VerdictContext): Verdict {
  const { sentiment, overview } = ctx;
  const control = controlOf(sentiment.net);

  const headline =
    control === "buyers"
      ? "Buyers in control"
      : control === "sellers"
        ? "Sellers in control"
        : "No side in control";

  const summary = sentiment.reasons.slice(0, 2).join(" · ");

  // Trap detection: price and positioning disagree, or highs/lows tested without
  // momentum behind the move.
  let trap = false;
  let trapNote: string | null = null;

  const priceUp = overview.changePercent > 0.05;
  const priceDown = overview.changePercent < -0.05;
  const sentBull = sentiment.net >= 15;
  const sentBear = sentiment.net <= -15;

  if ((priceUp && sentBear) || (priceDown && sentBull)) {
    trap = true;
    trapNote = "Price and positioning disagree — treat the move as suspect.";
  } else if (
    overview.dayHigh != null &&
    Math.abs(overview.ltp - overview.dayHigh) / overview.ltp < 0.001 &&
    !priceUp
  ) {
    trap = true;
    trapNote = "Testing the day high without momentum — sweep / reversal risk.";
  } else if (
    overview.dayLow != null &&
    Math.abs(overview.ltp - overview.dayLow) / overview.ltp < 0.001 &&
    !priceDown
  ) {
    trap = true;
    trapNote = "Testing the day low without momentum — sweep / reversal risk.";
  }

  return {
    bias: sentiment.overall,
    control,
    confidence: sentiment.confidence,
    headline,
    summary: summary || "Signals are mixed.",
    trap,
    trapNote,
  };
}
