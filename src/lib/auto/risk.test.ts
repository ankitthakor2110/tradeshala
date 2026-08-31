import { describe, it, expect } from "vitest";
import { checkDailyLimits, checkOpenPositions } from "./risk";
import { DEFAULT_AUTO_CONFIG } from "./config";
import type { AutoTradeConfig, RiskCounters } from "@/types/autoTrade";

const cfg = (over: Partial<AutoTradeConfig> = {}): AutoTradeConfig => ({ ...DEFAULT_AUTO_CONFIG, ...over });
const counters = (over: Partial<RiskCounters> = {}): RiskCounters => ({
  tradesToday: 0,
  realizedPnlToday: 0,
  consecutiveLosses: 0,
  openPositions: 0,
  ...over,
});

describe("checkDailyLimits", () => {
  it("passes under all limits", () => {
    expect(checkDailyLimits(cfg(), counters()).ok).toBe(true);
  });
  it("blocks at max trades per day (5/5)", () => {
    const r = checkDailyLimits(cfg(), counters({ tradesToday: 5 }));
    expect(r.ok).toBe(false);
  });
  it("blocks when daily loss reached (−5000 with cap 5000)", () => {
    const r = checkDailyLimits(cfg(), counters({ realizedPnlToday: -5000 }));
    expect(r.ok).toBe(false);
  });
  it("does not block on daily profit", () => {
    expect(checkDailyLimits(cfg(), counters({ realizedPnlToday: 8000 })).ok).toBe(true);
  });
  it("blocks at max consecutive losses (3/3)", () => {
    expect(checkDailyLimits(cfg(), counters({ consecutiveLosses: 3 })).ok).toBe(false);
  });
});

describe("checkOpenPositions", () => {
  it("allows when under the cap", () => {
    const r = checkOpenPositions(cfg(), counters({ openPositions: 0 }));
    expect(r.ok).toBe(true);
  });
  it("blocks at cap when action is IGNORE (default)", () => {
    const r = checkOpenPositions(cfg({ existingPositionAction: "IGNORE" }), counters({ openPositions: 1 }));
    expect(r.ok).toBe(false);
  });
  it("reverses at cap when action is REVERSE", () => {
    const r = checkOpenPositions(cfg({ existingPositionAction: "REVERSE" }), counters({ openPositions: 1 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action).toBe("REVERSE");
  });
  it("adds at cap when action is ADD", () => {
    const r = checkOpenPositions(cfg({ existingPositionAction: "ADD" }), counters({ openPositions: 1 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.action).toBe("ADD");
  });
});
