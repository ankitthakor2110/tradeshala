import { describe, it, expect } from "vitest";
import { calculateMarketBias, calculateBullBearScore, deriveInstitutionalFlow, type BrainContext } from "./brain";

const base: BrainContext = {
  bias: "bullish",
  confidence: 60,
  reasons: ["a", "b", "c", "d", "e", "f"],
  topSetup: { direction: "long", trigger: 24050 },
  support: 23900,
  resistance: 24200,
  trendConfidence: 70,
  eventGate: "ok",
  trap: false,
  falseBreakoutRisk: 20,
};

describe("calculateMarketBias", () => {
  it("long setup → Buy CE recommendation, strong momentum, low risk", () => {
    const r = calculateMarketBias(base);
    expect(r.recommendation).toBe("Buy CE above 24050");
    expect(r.recommendationDirection).toBe("long");
    expect(r.momentum).toBe("strong");
    expect(r.risk).toBe("low");
    expect(r.reasons.length).toBe(5); // capped at 5
  });

  it("short setup → Buy PE recommendation", () => {
    const r = calculateMarketBias({ ...base, topSetup: { direction: "short", trigger: 23950 } });
    expect(r.recommendation).toBe("Buy PE below 23950");
    expect(r.recommendationDirection).toBe("short");
  });

  it("event avoid → No Trade, high risk", () => {
    const r = calculateMarketBias({ ...base, eventGate: "avoid" });
    expect(r.recommendationDirection).toBe("wait");
    expect(r.risk).toBe("high");
  });

  it("no setup → wait", () => {
    const r = calculateMarketBias({ ...base, topSetup: null });
    expect(r.recommendationDirection).toBe("wait");
  });

  it("trap → high risk", () => {
    expect(calculateMarketBias({ ...base, trap: true }).risk).toBe("high");
  });
});

describe("calculateBullBearScore", () => {
  it("classifies dominance", () => {
    expect(calculateBullBearScore(70, 20).pressure).toBe("bull-dominant");
    expect(calculateBullBearScore(20, 70).pressure).toBe("bear-dominant");
    expect(calculateBullBearScore(45, 45).pressure).toBe("balanced");
  });
});

describe("deriveInstitutionalFlow", () => {
  it("put winner → put-writers control, fiiDii null", () => {
    const r = deriveInstitutionalFlow({ writerWinner: "put", changePercent: 0.3 });
    expect(r.controlledBy).toBe("put-writers");
    expect(r.fiiDii).toBeNull();
    expect(r.insufficient).toBe(false);
  });

  it("balanced writing falls back to price control", () => {
    expect(deriveInstitutionalFlow({ writerWinner: "balanced", changePercent: 0.3 }).controlledBy).toBe("buyers");
    expect(deriveInstitutionalFlow({ writerWinner: "balanced", changePercent: -0.3 }).controlledBy).toBe("sellers");
  });

  it("no writer read → insufficient", () => {
    expect(deriveInstitutionalFlow({ writerWinner: null, changePercent: 0 }).insufficient).toBe(true);
  });
});
