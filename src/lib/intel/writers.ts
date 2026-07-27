// Option-writer control: who dominates the chain — put writers (a support /
// bullish signal) or call writers (a resistance / bearish signal). Blends PCR
// (OI dominance), the session OI-writing skew (fresh writing), and ATM premium
// decay (a writer is "comfortable" when the premium they sold is bleeding).
// Pure — no DB / env / clock. Copy + weights come from INTEL_CONFIG.writers.

import type { WriterConfidence } from "@/types/intel";
import { INTEL_CONFIG } from "@/config/intel";

export interface WriterContext {
  pcr: number;
  /** Net fresh put- vs call-writing skew in [-1,1] (>0 = put writing dominant); null while warming. */
  oiSkewScore: number | null;
  /** Session ATM PE premium delta (₹). Negative = put premium decaying (bullish). null while warming. */
  atmPeLtpDelta: number | null;
  /** Session ATM CE premium delta (₹). Negative = call premium decaying (bearish). null while warming. */
  atmCeLtpDelta: number | null;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function calculateWriterConfidence(ctx: WriterContext): WriterConfidence {
  const cfg = INTEL_CONFIG.writers;
  const R = cfg.labels.reasons;

  // No chain at all → genuinely nothing to say.
  if (!(ctx.pcr > 0)) {
    return { putConfidence: null, callConfidence: null, winner: null, reason: R.balanced, insufficient: true };
  }

  const w = cfg.weights;
  const { pcrBullish, pcrBearish } = INTEL_CONFIG.sentiment;

  // --- Component 1: PCR (OI dominance) → put-vs-call tilt in [-1,1]. ---
  let pcrTilt = 0;
  if (ctx.pcr >= pcrBullish) pcrTilt = clamp01((ctx.pcr - pcrBullish) / 0.85 + 0.3);
  else if (ctx.pcr <= pcrBearish) pcrTilt = -clamp01((pcrBearish - ctx.pcr) / 0.6 + 0.3);

  // --- Component 2: fresh writing skew (session). >0 = put writing (bullish). ---
  const skewTilt = ctx.oiSkewScore ?? 0;

  // --- Component 3: premium decay. Puts bleeding ⇒ put writers winning (bullish);
  //     calls bleeding ⇒ call writers winning (bearish). Net into [-1,1]. ---
  let decayTilt = 0;
  const haveDecay = ctx.atmPeLtpDelta != null && ctx.atmCeLtpDelta != null;
  if (haveDecay) {
    const peDecay = -(ctx.atmPeLtpDelta as number); // >0 when PE premium falling
    const ceDecay = -(ctx.atmCeLtpDelta as number); // >0 when CE premium falling
    const denom = Math.abs(peDecay) + Math.abs(ceDecay);
    decayTilt = denom > 0 ? (peDecay - ceDecay) / denom : 0;
  }

  // Weighted net tilt in [-1,1]; only include components we actually have.
  let num = pcrTilt * w.pcr;
  let den = w.pcr;
  if (ctx.oiSkewScore != null) {
    num += skewTilt * w.oiSkew;
    den += w.oiSkew;
  }
  if (haveDecay) {
    num += decayTilt * w.premiumDecay;
    den += w.premiumDecay;
  }
  const net = den > 0 ? num / den : 0; // -1..1, >0 = put writers ahead

  const magnitude = Math.round(clamp01(Math.abs(net)) * 100);
  const putConfidence = net >= 0 ? 50 + Math.round(magnitude / 2) : 50 - Math.round(magnitude / 2);
  const callConfidence = 100 - putConfidence;

  const margin = putConfidence - callConfidence; // >0 = put ahead
  const winner: WriterConfidence["winner"] =
    Math.abs(margin) < cfg.balancedMargin ? "balanced" : margin > 0 ? "put" : "call";

  // Reason: prefer the sharpest live evidence for the winning side.
  let reason: string = winner === "put" ? R.pcrPut : winner === "call" ? R.pcrCall : R.balanced;
  if (winner === "put") {
    if (ctx.atmPeLtpDelta != null && ctx.atmPeLtpDelta < 0) reason = R.putPremiumDecay;
    else if (ctx.oiSkewScore != null && ctx.oiSkewScore > 0.05) reason = R.freshPutWriting;
    else if (ctx.atmCeLtpDelta != null && ctx.atmCeLtpDelta < 0) reason = R.callCovering;
  } else if (winner === "call") {
    if (ctx.atmCeLtpDelta != null && ctx.atmCeLtpDelta < 0) reason = R.callPremiumDecay;
    else if (ctx.oiSkewScore != null && ctx.oiSkewScore < -0.05) reason = R.freshCallWriting;
    else if (ctx.atmPeLtpDelta != null && ctx.atmPeLtpDelta < 0) reason = R.putCovering;
  }

  return { putConfidence, callConfidence, winner, reason, insufficient: false };
}
