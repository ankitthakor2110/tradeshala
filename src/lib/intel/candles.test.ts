import { describe, it, expect } from "vitest";
import { deriveVWAP, deriveATR, openingRange, dayHighLow, dayRange, distancePct, deriveTrend } from "./candles";
import type { Candle } from "@/types/intel";

const T0 = 1_700_000_000_000; // fixed epoch (no clock in tests)

function candle(i: number, o: number, h: number, l: number, c: number, v = 0): Candle {
  return { t: T0 + i * 60_000, o, h, l, c, v };
}

describe("deriveVWAP", () => {
  it("volume-weights the typical price when volume is present", () => {
    const cs = [candle(0, 100, 110, 90, 100, 10), candle(1, 100, 130, 110, 120, 30)];
    // tp0 = 100, tp1 = 120 → (100*10 + 120*30)/40 = 115
    const { vwap, reliable } = deriveVWAP(cs);
    expect(vwap).toBe(115);
    expect(reliable).toBe(true);
  });

  it("falls back to mean typical price and flags unreliable when volume is 0 (index feed)", () => {
    const cs = [candle(0, 100, 110, 90, 100, 0), candle(1, 100, 130, 110, 120, 0)];
    const { vwap, reliable } = deriveVWAP(cs);
    expect(vwap).toBe(110); // (100 + 120) / 2
    expect(reliable).toBe(false);
  });

  it("returns null for empty input", () => {
    expect(deriveVWAP([]).vwap).toBeNull();
  });
});

describe("deriveATR", () => {
  it("averages true range", () => {
    const cs = [candle(0, 100, 105, 95, 100), candle(1, 100, 110, 100, 108), candle(2, 108, 112, 104, 106)];
    // TR1 = max(10, |110-100|, |100-100|) = 10 ; TR2 = max(8, |112-108|, |104-108|) = 8 → mean 9
    expect(deriveATR(cs, 14)).toBe(9);
  });
  it("needs at least two candles", () => {
    expect(deriveATR([candle(0, 1, 2, 0, 1)])).toBeNull();
  });
});

describe("openingRange", () => {
  it("covers only the first N minutes", () => {
    const cs = [
      candle(0, 100, 105, 99, 102),
      candle(5, 102, 108, 101, 107),
      candle(20, 107, 120, 106, 118), // outside 15-min window
    ];
    expect(openingRange(cs, 15)).toEqual({ high: 108, low: 99 });
  });
});

describe("dayHighLow / dayRange / distancePct", () => {
  it("computes extremes and range", () => {
    const cs = [candle(0, 100, 110, 95, 100), candle(1, 100, 115, 98, 112)];
    expect(dayHighLow(cs)).toEqual({ high: 115, low: 95 });
    expect(dayRange(cs)).toBe(20);
  });
  it("signed distance %", () => {
    expect(distancePct(102, 100)).toBe(2);
    expect(distancePct(98, 100)).toBe(-2);
    expect(distancePct(100, null)).toBeNull();
  });
});

describe("deriveTrend", () => {
  it("reads a rising, above-VWAP series as bullish", () => {
    const cs = [candle(0, 100, 101, 99, 100), candle(1, 100, 103, 100, 102), candle(2, 102, 106, 102, 105), candle(3, 105, 109, 105, 108)];
    const { trend, confidence } = deriveTrend(cs, 101);
    expect(trend).toBe("bullish");
    expect(confidence).toBeGreaterThan(20);
  });
  it("reads a falling, below-VWAP series as bearish", () => {
    const cs = [candle(0, 108, 109, 105, 108), candle(1, 108, 108, 102, 103), candle(2, 103, 104, 99, 100), candle(3, 100, 101, 96, 97)];
    const { trend } = deriveTrend(cs, 106);
    expect(trend).toBe("bearish");
  });
});
