// Strike migration: institutional writers continuously shift the strikes they
// defend. Compares the SESSION-BASELINE support/resistance (highest put/call OI
// strikes captured on the first warmed poll, tracked by the hook) with the
// current ones, and reads the shift. Pure — no DB / env / clock.

import type { InsightTone, StrikeMigration, StrikeShift } from "@/types/intel";
import { INTEL_CONFIG } from "@/config/intel";

export interface MigrationContext {
  prevSupport: number | null; // session baseline (max put OI strike at first warmed poll)
  prevResistance: number | null; // session baseline (max call OI strike)
  currSupport: number | null;
  currResistance: number | null;
}

function shiftOf(prev: number | null, curr: number | null): StrikeShift {
  if (prev == null || curr == null) return "none";
  if (curr > prev) return "higher";
  if (curr < prev) return "lower";
  return "none";
}

export function calculateStrikeMigration(ctx: MigrationContext): StrikeMigration {
  const I = INTEL_CONFIG.migration.interpret;
  const { prevSupport, prevResistance, currSupport, currResistance } = ctx;

  if (prevSupport == null || prevResistance == null || currSupport == null || currResistance == null) {
    return {
      prevSupport,
      currSupport,
      supportShift: "none",
      prevResistance,
      currResistance,
      resistanceShift: "none",
      interpretation: INTEL_CONFIG.insufficientData,
      tone: "neutral",
      insufficient: true,
    };
  }

  const supportShift = shiftOf(prevSupport, currSupport);
  const resistanceShift = shiftOf(prevResistance, currResistance);

  let interpretation: string = I.none;
  let tone: InsightTone = "neutral";

  if (supportShift === "higher" && resistanceShift === "higher") {
    interpretation = I.strongBull;
    tone = "bullish";
  } else if (supportShift === "lower" && resistanceShift === "lower") {
    interpretation = I.strongBear;
    tone = "bearish";
  } else if (supportShift === "higher") {
    interpretation = I.supportHigher;
    tone = "bullish";
  } else if (resistanceShift === "lower") {
    interpretation = I.resistanceLower;
    tone = "bearish";
  } else if (supportShift === "lower") {
    interpretation = I.supportLower;
    tone = "bearish";
  } else if (resistanceShift === "higher") {
    interpretation = I.resistanceHigher;
    tone = "bullish";
  }

  return {
    prevSupport,
    currSupport,
    supportShift,
    prevResistance,
    currResistance,
    resistanceShift,
    interpretation,
    tone,
    insufficient: false,
  };
}
