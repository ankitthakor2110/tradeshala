// Rule-based, explainable trade setups. Derives BUY-ABOVE / SELL-BELOW triggers
// from real levels (opening range, day extremes, OI walls) and sizes stop/targets
// off ATR so the reward:risk is coherent. Confidence comes from the composite
// sentiment, so a setup only surfaces when the read actually supports it.
// Pure — no DB / env / clock.

import type { Bias, TradeSetup } from "@/types/intel";
import { INTEL_CONFIG } from "@/config/intel";
import { round2 } from "./candles";

export interface SetupContext {
  ltp: number;
  vwap: number | null;
  atr: number | null;
  openRangeHigh: number | null;
  openRangeLow: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  support: number; // max put OI strike
  resistance: number; // max call OI strike
  bias: Bias;
  bullScore: number; // sentiment.bull (0-100)
  bearScore: number; // sentiment.bear (0-100)
  trendConfidence: number; // 0-100
}

function nearestAbove(price: number, levels: (number | null)[]): number | null {
  const above = levels.filter((l): l is number => l != null && l > price).sort((a, b) => a - b);
  return above.length ? above[0] : null;
}

function nearestBelow(price: number, levels: (number | null)[]): number | null {
  const below = levels.filter((l): l is number => l != null && l < price).sort((a, b) => b - a);
  return below.length ? below[0] : null;
}

function riskFor(trigger: number, atr: number | null): number {
  const { atrStopMult, minStopPct } = INTEL_CONFIG.setups;
  const atrRisk = atr != null ? atr * atrStopMult : 0;
  return round2(Math.max(atrRisk, trigger * minStopPct));
}

export function buildSetups(ctx: SetupContext, threshold: number): TradeSetup[] {
  const { targetRR } = INTEL_CONFIG.setups;
  const out: TradeSetup[] = [];

  // ---- Long: buy above the nearest overhead trigger ----
  const longTrigger =
    nearestAbove(ctx.ltp, [ctx.openRangeHigh, ctx.dayHigh]) ??
    round2(ctx.ltp + riskFor(ctx.ltp, ctx.atr) * 0.25);
  const longRisk = riskFor(longTrigger, ctx.atr);
  const longConf = Math.round(
    Math.min(100, ctx.bullScore + (ctx.bias === "strong-bullish" ? 8 : 0))
  );
  if (longRisk > 0) {
    out.push({
      id: "long",
      direction: "long",
      entryLabel: "BUY ABOVE",
      trigger: longTrigger,
      stop: round2(longTrigger - longRisk),
      targets: [round2(longTrigger + longRisk * targetRR[0]), round2(longTrigger + longRisk * targetRR[1])],
      rr: targetRR[0],
      confidence: longConf,
      reason: `Bullish read (${ctx.bullScore}%). Buy the break of ${longTrigger}; put wall support near ${ctx.support}.`,
    });
  }

  // ---- Short: sell below the nearest level underneath ----
  const shortTrigger =
    nearestBelow(ctx.ltp, [ctx.openRangeLow, ctx.dayLow]) ??
    round2(ctx.ltp - riskFor(ctx.ltp, ctx.atr) * 0.25);
  const shortRisk = riskFor(shortTrigger, ctx.atr);
  const shortConf = Math.round(
    Math.min(100, ctx.bearScore + (ctx.bias === "strong-bearish" ? 8 : 0))
  );
  if (shortRisk > 0) {
    out.push({
      id: "short",
      direction: "short",
      entryLabel: "SELL BELOW",
      trigger: shortTrigger,
      stop: round2(shortTrigger + shortRisk),
      targets: [round2(shortTrigger - shortRisk * targetRR[0]), round2(shortTrigger - shortRisk * targetRR[1])],
      rr: targetRR[0],
      confidence: shortConf,
      reason: `Bearish read (${ctx.bearScore}%). Sell the break of ${shortTrigger}; call wall resistance near ${ctx.resistance}.`,
    });
  }

  return out
    .filter((s) => s.confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence);
}
