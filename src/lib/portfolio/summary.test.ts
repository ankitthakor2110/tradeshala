import { describe, it, expect } from "vitest";
import { accountValue, allocationBuckets, buildEquityCurve } from "./summary";

describe("accountValue", () => {
  it("is cash + open-positions mark-to-market", () => {
    expect(accountValue(1_000_000, 45_000)).toBe(1_045_000);
  });
  it("handles all-cash (no positions)", () => {
    expect(accountValue(1_000_000, 0)).toBe(1_000_000);
  });
});

describe("allocationBuckets", () => {
  const open = [
    { instrument_type: "EQ", current_value: 20_000 },
    { instrument_type: "EQ", current_value: 5_000 },
    { instrument_type: "CE", current_value: 8_000 },
    { instrument_type: "PE", current_value: 2_000 },
    { instrument_type: "FUT", current_value: 15_000 },
  ];

  it("buckets EQ -> equity, CE/PE -> options, FUT -> futures, plus cash", () => {
    const b = allocationBuckets(open, 100_000);
    expect(b.cash).toBe(100_000);
    expect(b.equity).toBe(25_000); // 20k + 5k
    expect(b.options).toBe(10_000); // 8k + 2k
    expect(b.futures).toBe(15_000);
  });

  it("is all-cash when there are no positions", () => {
    expect(allocationBuckets([], 500_000)).toEqual({ cash: 500_000, equity: 0, options: 0, futures: 0 });
  });
});

describe("buildEquityCurve", () => {
  const now = new Date("2026-06-24T00:00:00Z");
  const trades = [
    { closed_at: "2026-06-10T10:00:00Z", realized_pnl: 1000 },
    { closed_at: "2026-06-10T14:00:00Z", realized_pnl: -400 }, // same day -> merged
    { closed_at: "2026-06-20T11:00:00Z", realized_pnl: 2000 },
    { closed_at: "2026-01-01T09:00:00Z", realized_pnl: 9999 }, // outside 1M/3M windows
  ];

  it("accumulates realized P&L per day, chronologically (1M window)", () => {
    const curve = buildEquityCurve(trades, "1M", now);
    expect(curve).toEqual([
      { dateKey: "2026-06-10", cumulative: 600 }, // 1000 - 400
      { dateKey: "2026-06-20", cumulative: 2600 }, // 600 + 2000
    ]);
  });

  it("excludes trades older than the period cutoff", () => {
    const week = buildEquityCurve(trades, "1W", now); // only >= 2026-06-17
    expect(week.map((p) => p.dateKey)).toEqual(["2026-06-20"]);
  });

  it("'All' includes very old trades", () => {
    const all = buildEquityCurve(trades, "All", now);
    expect(all[0]).toEqual({ dateKey: "2026-01-01", cumulative: 9999 });
    expect(all.at(-1)?.cumulative).toBe(12599); // 9999 + 600 + 2000
  });

  it("ignores rows with no close date and is order-independent", () => {
    const shuffled = [
      { closed_at: null, realized_pnl: 5000 },
      { closed_at: "2026-06-20T11:00:00Z", realized_pnl: 2000 },
      { closed_at: "2026-06-10T10:00:00Z", realized_pnl: 600 },
    ];
    const curve = buildEquityCurve(shuffled, "All", now);
    expect(curve).toEqual([
      { dateKey: "2026-06-10", cumulative: 600 },
      { dateKey: "2026-06-20", cumulative: 2600 },
    ]);
  });

  it("returns empty for no closed trades", () => {
    expect(buildEquityCurve([], "All", now)).toEqual([]);
  });
});
