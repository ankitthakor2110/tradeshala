import { describe, it, expect } from "vitest";
import { planEntry, resolveOptionType, type PipelineContext } from "./pipeline";
import { DEFAULT_AUTO_CONFIG } from "./config";
import type { AutoTradeConfig, NormalizedSignal, StrikeCandidate } from "@/types/autoTrade";

const cfg = (over: Partial<AutoTradeConfig> = {}): AutoTradeConfig => ({
  ...DEFAULT_AUTO_CONFIG,
  ...over,
  // enable + automatic by default for these tests
  enabled: over.enabled ?? true,
  mode: over.mode ?? "AUTOMATIC",
});

const signal: NormalizedSignal = {
  signalId: "SIG-1",
  symbol: "NIFTY",
  direction: "BUY",
  event: "entry",
  side: "long",
  optionType: "CALL",
  price: 24500,
  strategy: "Breakout",
  timeframe: "3m",
  timestamp: "2026-08-20T10:15:00+05:30",
  source: "tradingview",
};

const candidates: StrikeCandidate[] = [
  { strike: 24400, delta: 0.72, ltp: 180, bid: 179, ask: 181 },
  { strike: 24500, delta: 0.63, ltp: 185.5, bid: 184, ask: 187 },
  { strike: 24600, delta: 0.51, ltp: 105, bid: 104, ask: 106 },
  { strike: 24700, delta: 0.39, ltp: 78, bid: 77, ask: 79 },
];

const ctx = (over: Partial<PipelineContext> = {}): PipelineContext => ({
  candidates,
  atmStrike: 24600,
  strikeStep: 100,
  expiry: "2026-08-27",
  lotSize: 65,
  chainSource: "upstox",
  counters: { tradesToday: 0, realizedPnlToday: 0, consecutiveLosses: 0, openPositions: 0 },
  isDuplicate: false,
  sessionOk: true,
  emergencyStopped: false,
  requireLive: true,
  ...over,
});

describe("resolveOptionType", () => {
  it("FOLLOW_SIGNAL derives CE from a long CALL signal", () => {
    expect(resolveOptionType(DEFAULT_AUTO_CONFIG, signal)).toBe("CE");
  });
  it("forces PE when config option type = PE", () => {
    expect(resolveOptionType({ ...DEFAULT_AUTO_CONFIG, instrument: { ...DEFAULT_AUTO_CONFIG.instrument, optionType: "PE" } }, signal)).toBe("PE");
  });
});

describe("planEntry — end-to-end (spec section 52)", () => {
  it("EXECUTED: delta 0.60 selects 24500 CE, target 30% / SL 15%, 1 lot", () => {
    const d = planEntry(cfg(), signal, ctx());
    expect(d.status).toBe("EXECUTED");
    expect(d.plan).not.toBeNull();
    if (d.plan) {
      expect(d.plan.strike).toBe(24500);
      expect(d.plan.optionType).toBe("CE");
      expect(d.plan.entryPrice).toBe(185.5);
      expect(d.plan.quantity).toBe(65);
      expect(d.plan.target).toBe(241.15); // 185.5 * 1.30
      expect(d.plan.stopLoss).toBe(157.67); // 185.5 * 0.85 = 157.6749… → 157.67
      expect(d.plan.delta).toBe(0.63);
    }
  });

  it("SKIPPED: no strike within delta tolerance", () => {
    const far = candidates.map((c) => ({ ...c, delta: 0.9 }));
    const d = planEntry(cfg(), signal, ctx({ candidates: far }));
    expect(d.status).toBe("SKIPPED");
    expect(d.reason).toMatch(/delta tolerance/i);
  });

  it("DUPLICATE when the signal was already processed", () => {
    const d = planEntry(cfg(), signal, ctx({ isDuplicate: true }));
    expect(d.status).toBe("DUPLICATE");
  });

  it("SKIPPED at max trades per day (5/5), plan still attached", () => {
    const d = planEntry(cfg(), signal, ctx({ counters: { tradesToday: 5, realizedPnlToday: 0, consecutiveLosses: 0, openPositions: 0 } }));
    expect(d.status).toBe("SKIPPED");
    expect(d.reason).toMatch(/trades per day/i);
    expect(d.plan).not.toBeNull();
  });

  it("SKIPPED at max open positions (1/1) with IGNORE", () => {
    const d = planEntry(cfg(), signal, ctx({ counters: { tradesToday: 0, realizedPnlToday: 0, consecutiveLosses: 0, openPositions: 1 } }));
    expect(d.status).toBe("SKIPPED");
    expect(d.reason).toMatch(/open positions/i);
  });

  it("REVERSE at cap when configured", () => {
    const d = planEntry(
      cfg({ existingPositionAction: "REVERSE" }),
      signal,
      ctx({ counters: { tradesToday: 0, realizedPnlToday: 0, consecutiveLosses: 0, openPositions: 1 } })
    );
    expect(d.status).toBe("EXECUTED");
    expect(d.openAction).toBe("REVERSE");
  });

  it("SKIPPED when daily loss limit reached", () => {
    const d = planEntry(cfg(), signal, ctx({ counters: { tradesToday: 1, realizedPnlToday: -5000, consecutiveLosses: 0, openPositions: 0 } }));
    expect(d.status).toBe("SKIPPED");
    expect(d.reason).toMatch(/daily loss/i);
  });

  it("SKIPPED (manual) records but never executes", () => {
    const d = planEntry(cfg({ mode: "MANUAL" }), signal, ctx());
    expect(d.status).toBe("SKIPPED");
    expect(d.plan).not.toBeNull();
  });

  it("PROPOSED in semi-automatic mode", () => {
    const d = planEntry(cfg({ mode: "SEMI" }), signal, ctx());
    expect(d.status).toBe("PROPOSED");
    expect(d.plan).not.toBeNull();
  });

  it("DRY_RUN when config.dryRun is on", () => {
    const d = planEntry(cfg({ dryRun: true }), signal, ctx());
    expect(d.status).toBe("DRY_RUN");
  });

  it("SKIPPED when disabled even in automatic mode", () => {
    const d = planEntry(cfg({ enabled: false }), signal, ctx());
    expect(d.status).toBe("SKIPPED");
    expect(d.reason).toMatch(/disabled/i);
  });

  it("SKIPPED outside the session window", () => {
    const d = planEntry(cfg(), signal, ctx({ sessionOk: false }));
    expect(d.status).toBe("SKIPPED");
    expect(d.reason).toMatch(/window/i);
  });

  it("SKIPPED when chain is mock and require-live is on", () => {
    const d = planEntry(cfg(), signal, ctx({ chainSource: "mock" }));
    expect(d.status).toBe("SKIPPED");
    expect(d.reason).toMatch(/mock/i);
  });

  it("SKIPPED (emergency stop) overrides everything", () => {
    const d = planEntry(cfg(), signal, ctx({ emergencyStopped: true }));
    expect(d.status).toBe("SKIPPED");
    expect(d.reason).toMatch(/stopped/i);
  });
});
