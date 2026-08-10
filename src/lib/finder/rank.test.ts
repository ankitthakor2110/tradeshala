import { describe, it, expect } from "vitest";
import { equityConviction, indexConviction } from "./rank";
import type { MarketData } from "@/types/database";

function quote(p: Partial<MarketData> & { symbol: string }): MarketData {
  return {
    symbol: p.symbol,
    exchange: p.exchange ?? "NSE",
    last_price: p.last_price ?? 100,
    open_price: p.open_price ?? 100,
    high_price: p.high_price ?? 100,
    low_price: p.low_price ?? 100,
    close_price: p.close_price ?? 100,
    change: p.change ?? 0,
    change_percent: p.change_percent ?? 0,
    volume: p.volume ?? 0,
    last_updated: p.last_updated ?? "2026-08-10T10:00:00Z",
  };
}

describe("equityConviction", () => {
  it("strong long: big up move pinned near the high", () => {
    const c = equityConviction(quote({ symbol: "A", change_percent: 3, low_price: 90, high_price: 110, last_price: 110 }));
    expect(c.direction).toBe("long");
    expect(c.label).toBe("strong");
    expect(c.score).toBe(100);
  });
  it("strong short: big down move pinned near the low", () => {
    const c = equityConviction(quote({ symbol: "A", change_percent: -3, low_price: 90, high_price: 110, last_price: 90 }));
    expect(c.direction).toBe("short");
    expect(c.score).toBe(100);
  });
  it("weak: an up move fading to the low of range scores low", () => {
    const c = equityConviction(quote({ symbol: "A", change_percent: 1, low_price: 90, high_price: 110, last_price: 90 }));
    expect(c.direction).toBe("long");
    // magnitude 1/3 * 0.6 = 0.2, align 0 → score 20
    expect(c.score).toBe(20);
    expect(c.label).toBe("weak");
  });
  it("flat move → neutral direction, range alignment defaults to 0.5", () => {
    const c = equityConviction(quote({ symbol: "A", change_percent: 0, low_price: 100, high_price: 100 }));
    expect(c.direction).toBe("neutral");
    expect(c.score).toBe(20); // 0.6*0 + 0.4*0.5 = 0.2
  });
  it("caps magnitude at the full-move threshold", () => {
    const big = equityConviction(quote({ symbol: "A", change_percent: 10, low_price: 90, high_price: 110, last_price: 110 }));
    expect(big.score).toBe(100);
  });
});

describe("indexConviction", () => {
  it("bullish PCR with spot above max pain → strong long", () => {
    const c = indexConviction({ pcr: 1.5, underlying: 24000, maxPain: 23800 });
    expect(c.direction).toBe("long");
    // pcrStrength = min(0.5/0.5,1)=1 → 0.6; mpAlign aligned =1 → 0.4; score 100
    expect(c.score).toBe(100);
    expect(c.label).toBe("strong");
  });
  it("bearish PCR with spot below max pain → strong short", () => {
    const c = indexConviction({ pcr: 0.5, underlying: 23800, maxPain: 24000 });
    expect(c.direction).toBe("short");
    expect(c.score).toBe(100);
  });
  it("bullish PCR but spot below max pain → penalised alignment", () => {
    const c = indexConviction({ pcr: 1.5, underlying: 23700, maxPain: 24000 });
    expect(c.direction).toBe("long");
    // 0.6*1 + 0.4*0.25 = 0.7 → 70
    expect(c.score).toBe(70);
  });
  it("neutral PCR → neutral, weak", () => {
    const c = indexConviction({ pcr: 1.0, underlying: 24000, maxPain: 24000 });
    expect(c.direction).toBe("neutral");
    // pcrStrength 0, mpAlign neutral 0.5 → 0.2 → 20
    expect(c.score).toBe(20);
    expect(c.label).toBe("weak");
  });
});
