import type { StrikeCandidate, StrikeMethod, StrikeFallback, StrikeResult } from "@/types/autoTrade";

// ============================================================================
// Strike selection — ATM / ITM / OTM / Offset / Delta (spec sections 7–11).
// Pure: given the option-chain rows (per side), the ATM strike, and the strike
// step, pick the contract. No DB/env/clock. The strike step comes from the chain
// (spacing between listed strikes), never hardcoded.
// ============================================================================

export interface StrikeSelectInput {
  method: StrikeMethod;
  optionType: "CE" | "PE";
  /** Candidate contracts for the chosen side (CE or PE), one per strike. */
  candidates: StrikeCandidate[];
  atmStrike: number;
  /** Distance between adjacent listed strikes (derived from the chain). */
  strikeStep: number;
  // Delta mode:
  targetDelta: number;
  maxDeltaDifference: number;
  fallback: StrikeFallback;
  // Offset mode (signed number of steps from ATM):
  offset: number;
  // ITM/OTM mode (number of steps):
  itmOtmSteps: number;
}

/** Nearest listed strike to `target` among the candidates (by absolute distance). */
function nearestListed(candidates: StrikeCandidate[], target: number): StrikeCandidate | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) =>
    Math.abs(c.strike - target) < Math.abs(best.strike - target) ? c : best
  );
}

function byStrike(candidates: StrikeCandidate[], strike: number): StrikeCandidate | null {
  return candidates.find((c) => c.strike === strike) ?? null;
}

/**
 * ITM/OTM direction is side-aware (spec section 11):
 *   CE: ITM = lower strikes, OTM = higher strikes.
 *   PE: ITM = higher strikes, OTM = lower strikes.
 * Returns the signed strike delta (in price) to add to ATM for `steps` in-the-
 * money (positive `steps`) — negative `steps` would be out-of-the-money.
 */
export function moneynessStrike(
  optionType: "CE" | "PE",
  atmStrike: number,
  strikeStep: number,
  itmSteps: number
): number {
  // For a CE, going ITM means DOWN in strike; for a PE, UP in strike.
  const sign = optionType === "CE" ? -1 : 1;
  return atmStrike + sign * itmSteps * strikeStep;
}

/** Select the strike per the configured method. Pure. */
export function selectStrike(input: StrikeSelectInput): StrikeResult {
  const { method, optionType, candidates, atmStrike, strikeStep } = input;
  if (candidates.length === 0) return { ok: false, reason: "Option chain has no contracts for the chosen side" };

  if (method === "ATM") {
    const row = byStrike(candidates, atmStrike) ?? nearestListed(candidates, atmStrike);
    if (!row) return { ok: false, reason: "No ATM strike available in the chain" };
    return { ok: true, strike: row.strike, delta: row.delta, method: "ATM", byDelta: false };
  }

  if (method === "OFFSET") {
    // Positive offset = higher strike, negative = lower (raw ladder offset).
    const targetStrike = atmStrike + input.offset * strikeStep;
    const row = byStrike(candidates, targetStrike) ?? nearestListed(candidates, targetStrike);
    if (!row) return { ok: false, reason: `No strike near ATM offset ${input.offset}` };
    const label = input.offset === 0 ? "ATM" : `ATM${input.offset > 0 ? "+" : ""}${input.offset}`;
    return { ok: true, strike: row.strike, delta: row.delta, method: label, byDelta: false };
  }

  if (method === "ITM" || method === "OTM") {
    // ITM = positive steps in the money; OTM = negative steps (out of the money).
    const steps = method === "ITM" ? input.itmOtmSteps : -input.itmOtmSteps;
    const targetStrike = moneynessStrike(optionType, atmStrike, strikeStep, steps);
    const row = byStrike(candidates, targetStrike) ?? nearestListed(candidates, targetStrike);
    if (!row) return { ok: false, reason: `No strike ${input.itmOtmSteps} ${method} available` };
    return {
      ok: true,
      strike: row.strike,
      delta: row.delta,
      method: `${input.itmOtmSteps} ${method}`,
      byDelta: false,
    };
  }

  // --- DELTA (spec sections 8–9) ---
  // Candidates with a usable (non-zero) delta.
  const withDelta = candidates.filter((c) => Math.abs(c.delta) > 0);
  if (withDelta.length === 0) {
    // No greeks fed — do not invent a delta (spec section 53). Fall back or skip.
    if (input.fallback === "CLOSEST") {
      const row = byStrike(candidates, atmStrike) ?? nearestListed(candidates, atmStrike);
      if (!row) return { ok: false, reason: "Delta unavailable and no ATM fallback strike" };
      return { ok: true, strike: row.strike, delta: row.delta, method: "ATM (delta unavailable)", byDelta: false };
    }
    return { ok: false, reason: "Delta-based selection unavailable: option chain does not provide delta" };
  }

  const dist = (c: StrikeCandidate) => Math.abs(Math.abs(c.delta) - input.targetDelta);
  const best = withDelta.reduce((b, c) => (dist(c) < dist(b) ? c : b));
  const diff = dist(best);

  if (diff <= input.maxDeltaDifference) {
    return { ok: true, strike: best.strike, delta: best.delta, method: `Δ ${input.targetDelta}`, byDelta: true };
  }

  // No strike within tolerance.
  if (input.fallback === "CLOSEST") {
    return {
      ok: true,
      strike: best.strike,
      delta: best.delta,
      method: `Δ ${input.targetDelta} (closest, Δdiff ${diff.toFixed(2)})`,
      byDelta: true,
    };
  }
  return {
    ok: false,
    reason: `No option within configured delta tolerance (closest Δ${Math.abs(best.delta).toFixed(
      2
    )}, diff ${diff.toFixed(2)} > ${input.maxDeltaDifference})`,
  };
}

/** Median gap between adjacent listed strikes; used when the caller has only the
 * strike list and no static gap. Returns 0 for fewer than two strikes. */
export function inferStrikeStep(strikes: number[]): number {
  const sorted = [...new Set(strikes)].sort((a, b) => a - b);
  if (sorted.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}
