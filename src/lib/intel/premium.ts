// ATM premium behaviour as a PRIMARY signal (not just an LTP readout). Reads the
// SESSION move in the ATM call & put premiums (the hook aggregates ATM±1 LTP
// deltas), classifies each leg's direction with a "fast" band relative to its
// own base premium, and interprets the CE/PE combination. Pure — no DB/env/clock.

import type { InsightTone, PremiumBehaviour, PremiumDirection, PremiumLeg } from "@/types/intel";
import { INTEL_CONFIG } from "@/config/intel";

export interface PremiumContext {
  ceLtp: number; // current ATM CE premium (base for %)
  peLtp: number; // current ATM PE premium
  ceLtpDelta: number | null; // session ₹ move in ATM CE premium; null while warming
  peLtpDelta: number | null; // session ₹ move in ATM PE premium
}

function classify(base: number, delta: number | null): PremiumLeg {
  if (delta == null || !(base > 0)) return { direction: "flat", changePct: null };
  const { fastPctOfBase, flatPct } = INTEL_CONFIG.premium;
  const pct = delta / base; // signed fraction
  const abs = Math.abs(pct);
  let direction: PremiumDirection;
  if (abs < flatPct) direction = "flat";
  else if (pct > 0) direction = abs >= fastPctOfBase ? "fast-rise" : "increasing";
  else direction = abs >= fastPctOfBase ? "fast-decay" : "decreasing";
  return { direction, changePct: Math.round(pct * 10000) / 100 }; // % with 2dp
}

const rising = (d: PremiumDirection) => d === "increasing" || d === "fast-rise";
const falling = (d: PremiumDirection) => d === "decreasing" || d === "fast-decay";

export function calculatePremiumBehaviour(ctx: PremiumContext): PremiumBehaviour {
  const I = INTEL_CONFIG.premium.interpret;
  const ce = classify(ctx.ceLtp, ctx.ceLtpDelta);
  const pe = classify(ctx.peLtp, ctx.peLtpDelta);

  if (ce.changePct == null && pe.changePct == null) {
    return { ce, pe, interpretation: INTEL_CONFIG.insufficientData, tone: "neutral", insufficient: true };
  }

  // Falling PUT premium = put writers comfortable = bullish.
  // Falling CALL premium = call writers comfortable = bearish.
  let interpretation: string = I.mixed;
  let tone: InsightTone = "neutral";

  if (falling(pe.direction) && rising(ce.direction)) {
    interpretation = I.strongBull;
    tone = "bullish";
  } else if (falling(ce.direction) && rising(pe.direction)) {
    interpretation = I.strongBear;
    tone = "bearish";
  } else if (pe.direction === "fast-decay") {
    interpretation = I.putComfortable;
    tone = "bullish";
  } else if (ce.direction === "fast-decay") {
    interpretation = I.callComfortable;
    tone = "bearish";
  } else if (falling(pe.direction)) {
    interpretation = I.putComfortable;
    tone = "bullish";
  } else if (falling(ce.direction)) {
    interpretation = I.callComfortable;
    tone = "bearish";
  } else if (rising(ce.direction) && rising(pe.direction)) {
    interpretation = I.mixed;
    tone = "neutral";
  } else if (rising(ce.direction)) {
    // Calls being bid up with puts flat — upside demand / call writers pressured.
    interpretation = I.callTrapped;
    tone = "bullish";
  } else if (rising(pe.direction)) {
    interpretation = I.putTrapped;
    tone = "bearish";
  }

  return { ce, pe, interpretation, tone, insufficient: false };
}
