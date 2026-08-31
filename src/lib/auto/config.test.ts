import { describe, it, expect } from "vitest";
import { DEFAULT_AUTO_CONFIG, validateConfig, mergeConfig } from "./config";

describe("validateConfig (spec section 28)", () => {
  it("accepts the default config", () => {
    expect(validateConfig(DEFAULT_AUTO_CONFIG)).toEqual([]);
  });
  it("rejects delta outside (0,1)", () => {
    const c = { ...DEFAULT_AUTO_CONFIG, strikeSelection: { ...DEFAULT_AUTO_CONFIG.strikeSelection, targetDelta: 1.5 } };
    expect(validateConfig(c).some((e) => /delta/i.test(e))).toBe(true);
  });
  it("rejects negative max delta difference", () => {
    const c = { ...DEFAULT_AUTO_CONFIG, strikeSelection: { ...DEFAULT_AUTO_CONFIG.strikeSelection, maxDeltaDifference: -1 } };
    expect(validateConfig(c).some((e) => /delta difference/i.test(e))).toBe(true);
  });
  it("rejects lots < 1", () => {
    const c = { ...DEFAULT_AUTO_CONFIG, quantity: { ...DEFAULT_AUTO_CONFIG.quantity, lots: 0 } };
    expect(validateConfig(c).some((e) => /lots/i.test(e))).toBe(true);
  });
  it("rejects SL value <= 0", () => {
    const c = { ...DEFAULT_AUTO_CONFIG, stopLoss: { ...DEFAULT_AUTO_CONFIG.stopLoss, value: 0 } };
    expect(validateConfig(c).some((e) => /stop loss/i.test(e))).toBe(true);
  });
  it("rejects RR with zero risk/reward", () => {
    const c = {
      ...DEFAULT_AUTO_CONFIG,
      target: { type: "RR" as const, value: 0 },
      riskReward: { enabled: true, risk: 0, reward: 0 },
    };
    const errs = validateConfig(c);
    expect(errs.some((e) => /risk/i.test(e))).toBe(true);
    expect(errs.some((e) => /reward/i.test(e))).toBe(true);
  });
  it("rejects max open positions < 1", () => {
    const c = { ...DEFAULT_AUTO_CONFIG, riskLimits: { ...DEFAULT_AUTO_CONFIG.riskLimits, maxOpenPositions: 0 } };
    expect(validateConfig(c).some((e) => /open positions/i.test(e))).toBe(true);
  });
});

describe("mergeConfig", () => {
  it("fills defaults for a partial stored config", () => {
    const merged = mergeConfig({ enabled: true, mode: "AUTOMATIC" });
    expect(merged.enabled).toBe(true);
    expect(merged.mode).toBe("AUTOMATIC");
    expect(merged.strikeSelection.targetDelta).toBe(DEFAULT_AUTO_CONFIG.strikeSelection.targetDelta);
    expect(merged.riskLimits.maxTradesPerDay).toBe(DEFAULT_AUTO_CONFIG.riskLimits.maxTradesPerDay);
  });
  it("returns a full default for null/garbage", () => {
    expect(mergeConfig(null)).toEqual(DEFAULT_AUTO_CONFIG);
    expect(mergeConfig("nope")).toEqual(DEFAULT_AUTO_CONFIG);
  });
  it("preserves nested overrides", () => {
    const merged = mergeConfig({ target: { type: "POINTS", value: 40 } });
    expect(merged.target).toEqual({ type: "POINTS", value: 40 });
  });
});
