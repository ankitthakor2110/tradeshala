import type { MarketData } from "@/types/database";
import { dayRangePosition } from "./screener";

// "Best trades now" conviction scoring — pure, unit-tested. A transparent
// composite, NOT a black box: equity conviction is momentum-based (all from live
// quotes); index conviction is option-positioning-based (from a live chain
// snapshot). Both return a 0-100 score, a direction, and a plain band label.
// These rank the screener / index cards; they are decision support, not advice.

export type ConvictionLabel = "strong" | "moderate" | "weak";

export interface Conviction {
  score: number; // 0-100
  direction: "long" | "short" | "neutral";
  label: ConvictionLabel;
}

function band(score: number): ConvictionLabel {
  if (score >= 66) return "strong";
  if (score >= 33) return "moderate";
  return "weak";
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Equity conviction from a live quote: how decisively a name is moving and
 * whether it's holding the extreme of its range in the move's direction. A
 * +2% stock pinned near the day's high scores high for a long; a -2% stock near
 * the low scores high for a short. Range alignment defaults to neutral (0.5)
 * when the session range isn't formed yet.
 *
 * @param fullMovePct % change treated as "maximum conviction" (default 3%).
 */
export function equityConviction(m: MarketData, fullMovePct = 3): Conviction {
  const chg = m.change_percent;
  const direction = chg > 0.1 ? "long" : chg < -0.1 ? "short" : "neutral";

  const magnitude = clamp01(Math.abs(chg) / fullMovePct);

  const pos = dayRangePosition(m); // 0 (low) → 1 (high), or null
  let align = 0.5;
  if (pos != null) {
    align = direction === "short" ? 1 - pos : pos; // long wants the high, short the low
  }

  const score = Math.round((0.6 * magnitude + 0.4 * align) * 100);
  return { score, direction, label: band(score) };
}

/**
 * Index conviction from a live option-chain snapshot: how far PCR leans off
 * neutral (put-writer vs call-writer dominance) and whether spot sits on the
 * supportive side of max pain for that lean. Single-fetch honest — no session
 * history required.
 */
export function indexConviction(
  row: { pcr: number; underlying: number; maxPain: number },
  pcrBullish = 1.15,
  pcrBearish = 0.8
): Conviction {
  const direction = row.pcr >= pcrBullish ? "long" : row.pcr <= pcrBearish ? "short" : "neutral";

  // |PCR - 1| of 0.5 or more reads as maximum positioning strength.
  const pcrStrength = clamp01(Math.abs(row.pcr - 1) / 0.5);

  let mpAlign = 0.5;
  if (row.maxPain > 0 && row.underlying > 0 && direction !== "neutral") {
    const above = row.underlying >= row.maxPain;
    const aligned = direction === "long" ? above : !above;
    mpAlign = aligned ? 1 : 0.25;
  }

  const score = Math.round((0.6 * pcrStrength + 0.4 * mpAlign) * 100);
  return { score, direction, label: band(score) };
}
