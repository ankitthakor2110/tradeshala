// Top-level assemblers for the "AI Market Intelligence" hero: the headline brief
// (bias, confidence, recommendation, S/R, momentum, risk, why), the bull/bear
// pressure read, and the institutional-flow read (derived from option writing —
// there is no FII/DII feed). Pure — no DB / env / clock.

import type {
  AiBrief,
  Bias,
  BullBearPressure,
  FlowController,
  InstitutionalFlow,
  MomentumStrength,
  RiskLevel,
  WriterWinner,
} from "@/types/intel";
import { INTEL_CONFIG } from "@/config/intel";

export interface BrainContext {
  bias: Bias;
  confidence: number; // 0-100
  reasons: string[]; // sentiment "why"
  topSetup: { direction: "long" | "short"; trigger: number } | null;
  support: number | null;
  resistance: number | null;
  trendConfidence: number; // 0-100 → momentum
  eventGate: "ok" | "caution" | "avoid" | null;
  trap: boolean;
  falseBreakoutRisk: number | null;
}

function momentumOf(trendConfidence: number): MomentumStrength {
  const { strong, moderate } = INTEL_CONFIG.aiBrief.momentumBands;
  if (trendConfidence >= strong) return "strong";
  if (trendConfidence >= moderate) return "moderate";
  return "weak";
}

function riskOf(ctx: BrainContext): RiskLevel {
  if (ctx.eventGate === "avoid" || ctx.trap || (ctx.falseBreakoutRisk ?? 0) >= 60) return "high";
  if (ctx.eventGate === "caution" || (ctx.falseBreakoutRisk ?? 0) >= 35) return "medium";
  return "low";
}

export function calculateMarketBias(ctx: BrainContext): AiBrief {
  const L = INTEL_CONFIG.aiBrief.labels;

  let recommendation: string = L.wait;
  let recommendationDirection: AiBrief["recommendationDirection"] = "wait";
  if (ctx.eventGate === "avoid") {
    recommendation = L.noTrade;
    recommendationDirection = "wait";
  } else if (ctx.topSetup) {
    if (ctx.topSetup.direction === "long") {
      recommendation = `Buy CE above ${ctx.topSetup.trigger}`;
      recommendationDirection = "long";
    } else {
      recommendation = `Buy PE below ${ctx.topSetup.trigger}`;
      recommendationDirection = "short";
    }
  }

  return {
    bias: ctx.bias,
    confidence: ctx.confidence,
    recommendation,
    recommendationDirection,
    support: ctx.support,
    resistance: ctx.resistance,
    momentum: momentumOf(ctx.trendConfidence),
    risk: riskOf(ctx),
    reasons: ctx.reasons.slice(0, 5),
  };
}

export function calculateBullBearScore(bull: number, bear: number): BullBearPressure {
  const pressure: BullBearPressure["pressure"] =
    bull - bear >= 10 ? "bull-dominant" : bear - bull >= 10 ? "bear-dominant" : "balanced";
  return { bull, bear, pressure };
}

export interface FlowContext {
  writerWinner: WriterWinner | null;
  changePercent: number;
}

export function deriveInstitutionalFlow(ctx: FlowContext): InstitutionalFlow {
  const L = INTEL_CONFIG.institutionalFlow.labels;

  if (ctx.writerWinner == null) {
    return {
      controlledBy: "balanced",
      explanation: INTEL_CONFIG.insufficientData,
      fiiDii: null,
      insufficient: true,
    };
  }

  let controlledBy: FlowController;
  if (ctx.writerWinner === "put") controlledBy = "put-writers";
  else if (ctx.writerWinner === "call") controlledBy = "call-writers";
  else if (ctx.changePercent > 0.1) controlledBy = "buyers";
  else if (ctx.changePercent < -0.1) controlledBy = "sellers";
  else controlledBy = "balanced";

  const who = L.controllers[controlledBy];
  const explanation =
    controlledBy === "put-writers"
      ? `${who} are defending downside — option flow leans bullish.`
      : controlledBy === "call-writers"
        ? `${who} are capping upside — option flow leans bearish.`
        : controlledBy === "buyers"
          ? `${who} are lifting offers — price leads, writing is two-sided.`
          : controlledBy === "sellers"
            ? `${who} are hitting bids — price leads, writing is two-sided.`
            : `Writing is two-sided — no clear institutional edge.`;

  return { controlledBy, explanation, fiiDii: null, insufficient: false };
}
