import type { TargetType, StopLossType, TrailType } from "@/types/autoTrade";

// ============================================================================
// Target / Stop-loss / Risk-reward / Trailing / Breakeven math (spec 15–19).
// Pure. All prices are OPTION PREMIUM (we BUY-to-open, so a "long" position: the
// premium rising is profit). `side` here is the option-buyer's direction: for a
// bought option the position is always long the premium — but we keep the BUY/
// SELL-generic math so it also works if a SELL-to-open path is added later.
// ============================================================================

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Direction of the premium position. A bought option is "long" the premium. */
export type PosDir = "long" | "short";

/**
 * Target price from entry.
 *   PERCENTAGE: long → entry*(1+v/100), short → entry*(1-v/100)
 *   POINTS:     long → entry+v,          short → entry-v
 *   PRICE:      the value is the absolute target price
 *   RR:         handled by targetFromRR (needs the stop) — not here
 */
export function computeTarget(entry: number, dir: PosDir, type: TargetType, value: number): number {
  switch (type) {
    case "PERCENTAGE":
      return round2(dir === "long" ? entry * (1 + value / 100) : entry * (1 - value / 100));
    case "POINTS":
      return round2(dir === "long" ? entry + value : entry - value);
    case "PRICE":
      return round2(value);
    case "RR":
      // Caller must use targetFromRR; return entry as a no-op guard.
      return round2(entry);
  }
}

/**
 * Stop-loss price from entry.
 *   PERCENTAGE: long → entry*(1-v/100), short → entry*(1+v/100)
 *   POINTS:     long → entry-v,          short → entry+v
 *   PRICE:      absolute stop price
 * Floored at 0.05 so a sub-value premium still gets a valid (near-worthless) stop.
 */
export function computeStopLoss(entry: number, dir: PosDir, type: StopLossType, value: number): number {
  let sl: number;
  switch (type) {
    case "PERCENTAGE":
      sl = dir === "long" ? entry * (1 - value / 100) : entry * (1 + value / 100);
      break;
    case "POINTS":
      sl = dir === "long" ? entry - value : entry + value;
      break;
    case "PRICE":
      sl = value;
      break;
  }
  return round2(dir === "long" ? Math.max(0.05, sl) : sl);
}

/**
 * Target derived from entry + stop using a risk:reward ratio (spec section 17).
 *   risk (per unit) = |entry - stop|
 *   reward = risk * (reward/risk ratio)
 *   long  → entry + reward,  short → entry - reward
 */
export function targetFromRR(entry: number, stop: number, riskUnits: number, rewardUnits: number, dir: PosDir): number {
  const risk = Math.abs(entry - stop);
  const ratio = riskUnits > 0 ? rewardUnits / riskUnits : 0;
  const reward = risk * ratio;
  return round2(dir === "long" ? entry + reward : entry - reward);
}

/**
 * Trailing-stop distance in premium points, from the configured type/value.
 * PERCENTAGE is taken against the entry premium. Used to stamp positions.trail_amount
 * (which the existing GTT executor already ratchets, direction-aware).
 */
export function computeTrailAmount(entry: number, type: TrailType, value: number): number {
  return round2(type === "PERCENTAGE" ? entry * (value / 100) : value);
}
