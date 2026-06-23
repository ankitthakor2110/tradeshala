import { describe, it, expect } from "vitest";
import { statsFor, computeAllStats, equityCurve, maxDrawdown } from "./stats";
import type { TvTrade } from "@/types/tradingview";

// Minimal trade factory — only the fields the stats functions read.
let seq = 0;
function trade(strategy: string, net: number, closedAt: string): TvTrade {
  seq += 1;
  return {
    id: `t${seq}`,
    strategy,
    symbol: "NIFTY",
    side: "long",
    option_type: null,
    entry_price: 100,
    exit_price: 100 + net,
    qty: 1,
    gross: net,
    cost: 0,
    net,
    reason: "manual",
    opened_at: closedAt,
    closed_at: closedAt,
    duration_seconds: 0,
  };
}

describe("statsFor", () => {
  it("computes win rate, profit factor, expectancy, net", () => {
    const trades = [
      trade("A", 100, "2026-06-23T10:00:00Z"),
      trade("A", -50, "2026-06-23T11:00:00Z"),
      trade("A", 200, "2026-06-23T12:00:00Z"),
      trade("A", -50, "2026-06-23T13:00:00Z"),
    ];
    const s = statsFor("A", trades);
    expect(s.trades).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(2);
    expect(s.winRate).toBe(50);
    expect(s.netPnl).toBe(200); // 100 - 50 + 200 - 50
    expect(s.profitFactor).toBe(3); // 300 / 100
    expect(s.avgWin).toBe(150); // 300 / 2
    expect(s.avgLoss).toBe(-50); // -100 / 2
    expect(s.expectancy).toBe(50); // 200 / 4
  });

  it("reports Infinity profit factor when there are no losses", () => {
    const s = statsFor("A", [trade("A", 100, "2026-06-23T10:00:00Z")]);
    expect(s.profitFactor).toBe(Infinity);
  });

  it("is all-zero for an empty trade set", () => {
    const s = statsFor("A", []);
    expect(s.trades).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.profitFactor).toBe(0);
    expect(s.expectancy).toBe(0);
  });
});

describe("maxDrawdown", () => {
  it("is 0 for a monotonically rising curve", () => {
    expect(
      maxDrawdown([
        trade("A", 100, "2026-06-23T10:00:00Z"),
        trade("A", 50, "2026-06-23T11:00:00Z"),
      ])
    ).toBe(0);
  });

  it("captures the worst peak-to-trough dip", () => {
    // cum: 100, 150, 50, 90 -> peak 150, trough 50 -> dd -100
    const dd = maxDrawdown([
      trade("A", 100, "2026-06-23T10:00:00Z"),
      trade("A", 50, "2026-06-23T11:00:00Z"),
      trade("A", -100, "2026-06-23T12:00:00Z"),
      trade("A", 40, "2026-06-23T13:00:00Z"),
    ]);
    expect(dd).toBe(-100);
  });

  it("walks chronologically regardless of input order", () => {
    const ddInOrder = maxDrawdown([
      trade("A", 100, "2026-06-23T10:00:00Z"),
      trade("A", -100, "2026-06-23T12:00:00Z"),
    ]);
    const ddReversed = maxDrawdown([
      trade("A", -100, "2026-06-23T12:00:00Z"),
      trade("A", 100, "2026-06-23T10:00:00Z"),
    ]);
    expect(ddInOrder).toBe(ddReversed);
    expect(ddInOrder).toBe(-100); // chronological: +100 (peak 100) then -100 (trough 0) -> dd -100
  });
});

describe("computeAllStats", () => {
  it("puts combined first, then strategies by net desc", () => {
    const trades = [
      trade("A", 100, "2026-06-23T10:00:00Z"),
      trade("B", 300, "2026-06-23T10:30:00Z"),
      trade("A", -50, "2026-06-23T11:00:00Z"),
    ];
    const all = computeAllStats(trades);
    expect(all[0].strategy).toBe("__combined__");
    expect(all[0].netPnl).toBe(350);
    expect(all[0].trades).toBe(3);
    expect(all[1].strategy).toBe("B"); // 300 > 50
    expect(all[2].strategy).toBe("A");
  });
});

describe("equityCurve", () => {
  it("accumulates net chronologically", () => {
    const trades = [
      trade("A", 100, "2026-06-23T12:00:00Z"),
      trade("A", -40, "2026-06-23T10:00:00Z"),
    ];
    const curve = equityCurve(trades);
    expect(curve.map((p) => p.cumulative)).toEqual([-40, 60]);
  });

  it("filters by strategy when given one", () => {
    const trades = [
      trade("A", 100, "2026-06-23T10:00:00Z"),
      trade("B", 999, "2026-06-23T11:00:00Z"),
    ];
    const curve = equityCurve(trades, "A");
    expect(curve).toHaveLength(1);
    expect(curve[0].cumulative).toBe(100);
  });
});
