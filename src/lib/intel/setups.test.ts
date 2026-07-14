import { describe, it, expect } from "vitest";
import { buildSetups, type SetupContext } from "./setups";

const ctx: SetupContext = {
  ltp: 24000,
  vwap: 23980,
  atr: 40,
  openRangeHigh: 24030,
  openRangeLow: 23950,
  dayHigh: 24080,
  dayLow: 23900,
  support: 23900,
  resistance: 24100,
  bias: "strong-bullish",
  bullScore: 78,
  bearScore: 12,
  trendConfidence: 70,
};

describe("buildSetups", () => {
  it("emits a long setup above threshold with a coherent stop/target", () => {
    const setups = buildSetups(ctx, 60);
    const long = setups.find((s) => s.direction === "long");
    expect(long).toBeTruthy();
    expect(long!.entryLabel).toBe("BUY ABOVE");
    expect(long!.trigger).toBe(24030); // nearest overhead level (ORH)
    expect(long!.stop).toBeLessThan(long!.trigger);
    expect(long!.targets[0]).toBeGreaterThan(long!.trigger);
    expect(long!.targets[1]).toBeGreaterThan(long!.targets[0]);
  });

  it("filters out setups below the confidence threshold", () => {
    // Bear side has only 12% confidence — never surfaces at threshold 60.
    const setups = buildSetups(ctx, 60);
    expect(setups.find((s) => s.direction === "short")).toBeUndefined();
  });

  it("higher threshold can suppress even the strong side", () => {
    expect(buildSetups(ctx, 90)).toHaveLength(0);
  });

  it("sorts by confidence descending", () => {
    const balanced = buildSetups({ ...ctx, bullScore: 65, bearScore: 70, bias: "bearish" }, 60);
    expect(balanced[0].confidence).toBeGreaterThanOrEqual(balanced[balanced.length - 1].confidence);
  });
});
