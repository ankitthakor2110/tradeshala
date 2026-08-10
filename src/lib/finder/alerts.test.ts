import { describe, it, expect } from "vitest";
import { alertCandidates, filterOnCooldown, buildFinderAlertText } from "./alerts";
import type { ScreenerRow } from "@/types/finder";

function quote(symbol: string, change_percent: number, last_price = 100): ScreenerRow {
  return {
    symbol,
    exchange: "NSE",
    last_price,
    open_price: 100,
    high_price: 100,
    low_price: 100,
    close_price: 100,
    change: 0,
    change_percent,
    volume: 0,
    last_updated: "2026-08-10T10:00:00Z",
  };
}

describe("alertCandidates", () => {
  const rows = [quote("A", 2.5), quote("B", -3), quote("C", 0.5)];
  it("keeps rows meeting the absolute threshold", () => {
    expect(alertCandidates(rows, 2).map((a) => a.symbol)).toEqual(["A", "B"]);
  });
  it("threshold of 0 or less alerts nothing", () => {
    expect(alertCandidates(rows, 0)).toEqual([]);
    expect(alertCandidates(rows, -1)).toEqual([]);
  });
  it("maps ltp from last_price", () => {
    expect(alertCandidates([quote("A", 5, 250)], 2)[0]).toEqual({ symbol: "A", changePercent: 5, ltp: 250 });
  });
});

describe("filterOnCooldown", () => {
  const cand = [
    { symbol: "A", changePercent: 3, ltp: 100 },
    { symbol: "B", changePercent: -3, ltp: 200 },
  ];
  it("sends fresh symbols and records their timestamp", () => {
    const { send, nextLastAlerted } = filterOnCooldown(cand, {}, 1000, 600000);
    expect(send.map((s) => s.symbol)).toEqual(["A", "B"]);
    expect(nextLastAlerted).toEqual({ A: 1000, B: 1000 });
  });
  it("suppresses symbols still within cooldown", () => {
    const { send } = filterOnCooldown(cand, { A: 1000 }, 1000 + 60000, 600000);
    expect(send.map((s) => s.symbol)).toEqual(["B"]);
  });
  it("re-sends once cooldown elapses and bumps the timestamp", () => {
    const now = 1000 + 600000;
    const { send, nextLastAlerted } = filterOnCooldown(cand, { A: 1000, B: 1000 }, now, 600000);
    expect(send.map((s) => s.symbol)).toEqual(["A", "B"]);
    expect(nextLastAlerted.A).toBe(now);
  });
  it("preserves cooldown entries for symbols not in this batch", () => {
    const { nextLastAlerted } = filterOnCooldown(cand, { Z: 500 }, 1000, 600000);
    expect(nextLastAlerted.Z).toBe(500);
  });
});

describe("buildFinderAlertText", () => {
  it("formats an HTML batch with signs and escaping", () => {
    const text = buildFinderAlertText([
      { symbol: "A&B", changePercent: 2.5, ltp: 1234.5 },
      { symbol: "C", changePercent: -3, ltp: 50 },
    ]);
    expect(text).toContain("🟢 <b>A&amp;B</b> +2.50%");
    expect(text).toContain("🔴 <b>C</b> -3.00%");
    expect(text).toContain("Trade Finder");
  });
});
