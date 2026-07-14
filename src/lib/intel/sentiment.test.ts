import { describe, it, expect } from "vitest";
import { computeSentiment, type SentimentInputs } from "./sentiment";

const base: SentimentInputs = {
  pcr: 1.0,
  priceVsVwapPct: 0,
  trend: "neutral",
  trendConfidence: 0,
  oiSkewScore: 0,
  changePercent: 0,
};

describe("computeSentiment", () => {
  it("all-bullish inputs read strongly bullish with bull >> bear", () => {
    const s = computeSentiment({
      pcr: 1.6,
      priceVsVwapPct: 0.4,
      trend: "bullish",
      trendConfidence: 90,
      oiSkewScore: 0.8,
      changePercent: 0.6,
    });
    expect(s.bull).toBeGreaterThan(s.bear);
    expect(["bullish", "strong-bullish"]).toContain(s.overall);
    expect(s.net).toBeGreaterThan(0);
    expect(s.reasons.length).toBeGreaterThan(0);
  });

  it("all-bearish inputs read bearish", () => {
    const s = computeSentiment({
      pcr: 0.6,
      priceVsVwapPct: -0.4,
      trend: "bearish",
      trendConfidence: 90,
      oiSkewScore: -0.8,
      changePercent: -0.6,
    });
    expect(s.bear).toBeGreaterThan(s.bull);
    expect(["bearish", "strong-bearish"]).toContain(s.overall);
    expect(s.net).toBeLessThan(0);
  });

  it("balanced inputs read neutral, shares sum to ~100", () => {
    const s = computeSentiment(base);
    expect(s.overall).toBe("neutral");
    expect(s.bull + s.bear + s.neutral).toBe(100);
    expect(s.neutral).toBeGreaterThan(s.bull);
  });

  it("shares always sum to 100", () => {
    const s = computeSentiment({ ...base, pcr: 1.3, trend: "bullish", trendConfidence: 40 });
    expect(s.bull + s.bear + s.neutral).toBe(100);
  });
});
