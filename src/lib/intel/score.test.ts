import { describe, it, expect } from "vitest";
import {
  calculateIntelligenceScore,
  calculateConfidenceMetrics,
  type ScoreContext,
  type ConfidenceContext,
} from "./score";

const neutral: ScoreContext = {
  premiumTone: "neutral",
  premiumAvailable: true,
  pcr: 1.0,
  oiSkewScore: 0,
  ceVolume: 500,
  peVolume: 500,
  migrationTone: "neutral",
  migrationAvailable: true,
  trend: "neutral",
  trendConfidence: 0,
  atmCeIv: null,
  atmPeIv: null,
  changePercent: 0,
  distanceFromVwapPct: 0,
};

describe("calculateIntelligenceScore", () => {
  it("balanced inputs → ~50 neutral", () => {
    const r = calculateIntelligenceScore(neutral);
    expect(r.score).toBe(50);
    expect(r.tone).toBe("neutral");
  });

  it("bullish stack → score > 50, bullish tone", () => {
    const r = calculateIntelligenceScore({
      ...neutral,
      premiumTone: "bullish",
      pcr: 1.6,
      oiSkewScore: 0.8,
      ceVolume: 1000,
      peVolume: 200,
      migrationTone: "bullish",
      trend: "bullish",
      trendConfidence: 80,
      changePercent: 0.3,
      distanceFromVwapPct: 0.2,
    });
    expect(r.score).toBeGreaterThan(50);
    expect(r.tone).toBe("bullish");
  });

  it("bearish stack → score < 50, bearish tone", () => {
    const r = calculateIntelligenceScore({
      ...neutral,
      premiumTone: "bearish",
      pcr: 0.6,
      oiSkewScore: -0.8,
      ceVolume: 200,
      peVolume: 1000,
      migrationTone: "bearish",
      trend: "bearish",
      trendConfidence: 80,
      changePercent: -0.3,
      distanceFromVwapPct: -0.2,
    });
    expect(r.score).toBeLessThan(50);
    expect(r.tone).toBe("bearish");
  });

  it("breadth & greeks always present but unavailable", () => {
    const r = calculateIntelligenceScore(neutral);
    const keys = r.factors.filter((f) => !f.available).map((f) => f.key);
    expect(keys).toContain("breadth");
    expect(keys).toContain("greeks");
  });
});

const cbase: ConfidenceContext = {
  writerConfidence: 70,
  setupConfidence: 80,
  trend: "bullish",
  trendConfidence: 70,
  trap: false,
  distanceToTriggerAtr: 0,
  oiSkewScore: 0.5,
  changePercent: 0.4,
  eventGate: "ok",
  atExtreme: false,
};

describe("calculateConfidenceMetrics", () => {
  it("clean bullish → decent breakout prob, low false-break risk", () => {
    const r = calculateConfidenceMetrics(cbase);
    expect(r.breakoutProbability!).toBeGreaterThan(50);
    expect(r.falseBreakoutRisk!).toBeLessThan(40);
    expect(r.writerConfidence).toBe(70);
  });

  it("trap + extreme raises false-breakout & reversal risk", () => {
    const clean = calculateConfidenceMetrics(cbase);
    const risky = calculateConfidenceMetrics({ ...cbase, trap: true, atExtreme: true, eventGate: "avoid" });
    expect(risky.falseBreakoutRisk!).toBeGreaterThan(clean.falseBreakoutRisk!);
    expect(risky.reversalProbability!).toBeGreaterThan(clean.reversalProbability!);
  });

  it("no setup → breakout probability null", () => {
    const r = calculateConfidenceMetrics({ ...cbase, setupConfidence: null });
    expect(r.breakoutProbability).toBeNull();
  });
});
