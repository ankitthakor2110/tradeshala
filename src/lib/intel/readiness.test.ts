import { describe, it, expect } from "vitest";
import { calculateTradeReadiness, type ReadinessContext } from "./readiness";

const allLong: ReadinessContext = {
  writerWinner: "put",
  pcr: 1.6,
  premiumTone: "bullish",
  oiSkewScore: 0.8,
  ceVolume: 1000,
  peVolume: 200,
  migrationTone: "bullish",
  ltp: 24100,
  vwap: 24000,
  changePercent: 0.5,
  support: 24050,
  resistance: 24080,
};

describe("calculateTradeReadiness", () => {
  it("fully aligned bullish → high score, long, ready", () => {
    const r = calculateTradeReadiness(allLong);
    expect(r.direction).toBe("long");
    expect(r.score).toBe(100);
    expect(r.label).toBe("Ready for breakout");
    expect(r.factors.every((f) => f.state === "pass")).toBe(true);
  });

  it("no confirmations → low score, avoid", () => {
    const r = calculateTradeReadiness({
      writerWinner: "balanced",
      pcr: 1.0,
      premiumTone: "neutral",
      oiSkewScore: 0,
      ceVolume: 500,
      peVolume: 500,
      migrationTone: "neutral",
      ltp: 24100,
      vwap: 24100,
      changePercent: 0,
      support: 20000,
      resistance: 30000,
    });
    expect(r.direction).toBe("none");
    expect(r.score).toBe(0);
    expect(r.label).toBe("Avoid trading");
  });

  it("score never exceeds 100 or drops below 0", () => {
    const r = calculateTradeReadiness(allLong);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
