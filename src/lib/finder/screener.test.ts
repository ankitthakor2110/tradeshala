import { describe, it, expect } from "vitest";
import {
  dayRangePosition,
  gapPercent,
  momentumTag,
  rankRows,
  applyFilters,
  effectiveSort,
  buildScreenerView,
} from "./screener";
import type { MarketData } from "@/types/database";
import type { ScreenerFilters } from "@/types/finder";

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

describe("dayRangePosition", () => {
  it("returns 0 at the low, 1 at the high, 0.5 in the middle", () => {
    expect(dayRangePosition(quote({ symbol: "A", low_price: 90, high_price: 110, last_price: 90 }))).toBe(0);
    expect(dayRangePosition(quote({ symbol: "A", low_price: 90, high_price: 110, last_price: 110 }))).toBe(1);
    expect(dayRangePosition(quote({ symbol: "A", low_price: 90, high_price: 110, last_price: 100 }))).toBe(0.5);
  });
  it("returns null for a degenerate range (high === low or missing)", () => {
    expect(dayRangePosition(quote({ symbol: "A", low_price: 100, high_price: 100 }))).toBeNull();
    expect(dayRangePosition(quote({ symbol: "A", low_price: 0, high_price: 0 }))).toBeNull();
  });
  it("clamps a print that slips outside the session range", () => {
    expect(dayRangePosition(quote({ symbol: "A", low_price: 90, high_price: 110, last_price: 115 }))).toBe(1);
    expect(dayRangePosition(quote({ symbol: "A", low_price: 90, high_price: 110, last_price: 85 }))).toBe(0);
  });
});

describe("gapPercent", () => {
  it("computes open vs previous close", () => {
    expect(gapPercent(quote({ symbol: "A", open_price: 102, close_price: 100 }))).toBe(2);
    expect(gapPercent(quote({ symbol: "A", open_price: 99, close_price: 100 }))).toBe(-1);
  });
  it("returns null when a price is missing", () => {
    expect(gapPercent(quote({ symbol: "A", open_price: 0, close_price: 100 }))).toBeNull();
  });
});

describe("momentumTag", () => {
  it("buckets by % change", () => {
    expect(momentumTag(3)).toBe("strong-up");
    expect(momentumTag(0.5)).toBe("up");
    expect(momentumTag(0)).toBe("flat");
    expect(momentumTag(-0.5)).toBe("down");
    expect(momentumTag(-5)).toBe("strong-down");
  });
});

describe("rankRows", () => {
  const rows = [
    quote({ symbol: "B", change_percent: 1, last_price: 200, volume: 50 }),
    quote({ symbol: "A", change_percent: 3, last_price: 100, volume: 10 }),
    quote({ symbol: "C", change_percent: -2, last_price: 300, volume: 90 }),
  ];
  it("sorts numeric desc/asc without mutating input", () => {
    const order = rankRows(rows, "changePercent", "desc").map((r) => r.symbol);
    expect(order).toEqual(["A", "B", "C"]);
    expect(rankRows(rows, "volume", "asc").map((r) => r.symbol)).toEqual(["A", "B", "C"]);
    // input untouched
    expect(rows[0].symbol).toBe("B");
  });
  it("sorts symbol alphabetically", () => {
    expect(rankRows(rows, "symbol", "asc").map((r) => r.symbol)).toEqual(["A", "B", "C"]);
  });
  it("pushes rows with no valid day range to the bottom", () => {
    const mixed = [
      quote({ symbol: "NR", low_price: 100, high_price: 100 }), // null range
      quote({ symbol: "R", low_price: 90, high_price: 110, last_price: 105 }),
    ];
    expect(rankRows(mixed, "dayRange", "desc").map((r) => r.symbol)).toEqual(["R", "NR"]);
  });
});

describe("applyFilters", () => {
  const rows = [
    quote({ symbol: "UP", change_percent: 2 }),
    quote({ symbol: "DOWN", change_percent: -3 }),
    quote({ symbol: "FLAT", change_percent: 0.05 }),
  ];
  const base: ScreenerFilters = { preset: "all", minAbsChangePct: 0 };

  it("gainers keeps only positive movers", () => {
    expect(applyFilters(rows, { ...base, preset: "gainers" }, new Set()).map((r) => r.symbol)).toEqual(["UP", "FLAT"]);
  });
  it("losers keeps only negative movers", () => {
    expect(applyFilters(rows, { ...base, preset: "losers" }, new Set()).map((r) => r.symbol)).toEqual(["DOWN"]);
  });
  it("noise floor drops small movers", () => {
    expect(applyFilters(rows, { ...base, minAbsChangePct: 1 }, new Set()).map((r) => r.symbol)).toEqual(["UP", "DOWN"]);
  });
  it("watchlist keeps only watched symbols, empty set yields nothing", () => {
    expect(applyFilters(rows, { ...base, preset: "watchlist" }, new Set(["DOWN"])).map((r) => r.symbol)).toEqual(["DOWN"]);
    expect(applyFilters(rows, { ...base, preset: "watchlist" }, new Set())).toEqual([]);
  });
});

describe("effectiveSort", () => {
  const base: ScreenerFilters = { preset: "all", minAbsChangePct: 0 };
  it("presets force their natural ordering", () => {
    expect(effectiveSort({ ...base, preset: "gainers" }, "symbol", "asc")).toEqual({ key: "changePercent", dir: "desc" });
    expect(effectiveSort({ ...base, preset: "losers" }, "symbol", "asc")).toEqual({ key: "changePercent", dir: "asc" });
    expect(effectiveSort({ ...base, preset: "highVolume" }, "symbol", "asc")).toEqual({ key: "volume", dir: "desc" });
  });
  it("all/watchlist honor the caller's sort", () => {
    expect(effectiveSort({ ...base, preset: "all" }, "ltp", "asc")).toEqual({ key: "ltp", dir: "asc" });
  });
});

describe("buildScreenerView", () => {
  it("filters then ranks with the preset-aware sort", () => {
    const rows = [
      quote({ symbol: "A", change_percent: 1 }),
      quote({ symbol: "B", change_percent: 4 }),
      quote({ symbol: "C", change_percent: -2 }),
    ];
    const view = buildScreenerView(rows, { preset: "gainers", minAbsChangePct: 0 }, "symbol", "asc", new Set());
    expect(view.map((r) => r.symbol)).toEqual(["B", "A"]);
  });
});
