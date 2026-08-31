import { describe, it, expect } from "vitest";
import { computeTarget, computeStopLoss, targetFromRR, computeTrailAmount } from "./targets";

describe("computeTarget", () => {
  it("PERCENTAGE: entry 100, 30% → long 130, short 70", () => {
    expect(computeTarget(100, "long", "PERCENTAGE", 30)).toBe(130);
    expect(computeTarget(100, "short", "PERCENTAGE", 30)).toBe(70);
  });
  it("POINTS: entry 100, 30 pts → long 130, short 70", () => {
    expect(computeTarget(100, "long", "POINTS", 30)).toBe(130);
    expect(computeTarget(100, "short", "POINTS", 30)).toBe(70);
  });
  it("PRICE: absolute", () => {
    expect(computeTarget(100, "long", "PRICE", 130)).toBe(130);
  });
});

describe("computeStopLoss", () => {
  it("PERCENTAGE: entry 100, 15% → long 85, short 115", () => {
    expect(computeStopLoss(100, "long", "PERCENTAGE", 15)).toBe(85);
    expect(computeStopLoss(100, "short", "PERCENTAGE", 15)).toBe(115);
  });
  it("POINTS: entry 100, 15 pts → long 85, short 115", () => {
    expect(computeStopLoss(100, "long", "POINTS", 15)).toBe(85);
    expect(computeStopLoss(100, "short", "POINTS", 15)).toBe(115);
  });
  it("floors a long stop at 0.05", () => {
    expect(computeStopLoss(3, "long", "POINTS", 10)).toBe(0.05);
  });
});

describe("targetFromRR (spec section 17)", () => {
  it("entry 100, SL 90, RR 1:2 → target 120", () => {
    expect(targetFromRR(100, 90, 1, 2, "long")).toBe(120);
  });
  it("entry 100, SL 90, RR 1:3 → target 130", () => {
    expect(targetFromRR(100, 90, 1, 3, "long")).toBe(130);
  });
  it("short: entry 100, SL 110, RR 1:2 → target 80", () => {
    expect(targetFromRR(100, 110, 1, 2, "short")).toBe(80);
  });
});

describe("computeTrailAmount", () => {
  it("POINTS returns the raw value", () => {
    expect(computeTrailAmount(150, "POINTS", 10)).toBe(10);
  });
  it("PERCENTAGE is against entry", () => {
    expect(computeTrailAmount(200, "PERCENTAGE", 5)).toBe(10);
  });
});
