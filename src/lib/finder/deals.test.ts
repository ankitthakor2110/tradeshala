import { describe, it, expect } from "vitest";
import {
  normalizeDealRow,
  parseLargeDeals,
  filterDeals,
  dealSymbolSet,
} from "./deals";
import type { LargeDeal } from "@/types/finder";

describe("normalizeDealRow", () => {
  it("parses NSE string fields to typed values", () => {
    const d = normalizeDealRow(
      { symbol: "committed", name: "Committed Cargo", clientName: "SONIA BHARAL", buySell: "SELL", qty: "72,000", watp: "350", date: "07-Aug-2026" },
      "bulk"
    );
    expect(d).toEqual({
      symbol: "COMMITTED",
      name: "Committed Cargo",
      clientName: "SONIA BHARAL",
      side: "SELL",
      qty: 72000,
      watp: 350,
      date: "07-Aug-2026",
      dealType: "bulk",
    });
  });
  it("returns null when there is no symbol", () => {
    expect(normalizeDealRow({ symbol: "", name: "X" }, "bulk")).toBeNull();
    expect(normalizeDealRow({ name: "X" }, "block")).toBeNull();
  });
  it("handles null side/watp and missing client gracefully", () => {
    const d = normalizeDealRow({ symbol: "360ONE", name: "360 ONE", buySell: null, qty: "1", watp: null, date: "07-Aug-2026" }, "short");
    expect(d?.side).toBeNull();
    expect(d?.watp).toBeNull();
    expect(d?.clientName).toBe("—");
    expect(d?.qty).toBe(1);
  });
});

describe("parseLargeDeals", () => {
  it("flattens bulk/block/short with as-on date, tagging deal types", () => {
    const { deals, asOn } = parseLargeDeals({
      as_on_date: "07-Aug-2026",
      BULK_DEALS_DATA: [{ symbol: "A", buySell: "BUY", qty: "10", watp: "5" }],
      BLOCK_DEALS_DATA: [{ symbol: "B", buySell: "SELL", qty: "20" }],
      SHORT_DEALS_DATA: [{ symbol: "C", qty: "30" }],
    });
    expect(asOn).toBe("07-Aug-2026");
    expect(deals.map((d) => [d.symbol, d.dealType])).toEqual([
      ["A", "bulk"],
      ["B", "block"],
      ["C", "short"],
    ]);
  });
  it("tolerates missing arrays", () => {
    expect(parseLargeDeals({}).deals).toEqual([]);
    expect(parseLargeDeals({}).asOn).toBeNull();
  });
});

function deal(p: Partial<LargeDeal> & { symbol: string; dealType: LargeDeal["dealType"] }): LargeDeal {
  return {
    symbol: p.symbol,
    name: p.name ?? p.symbol,
    clientName: p.clientName ?? "—",
    side: p.side ?? null,
    qty: p.qty ?? 0,
    watp: p.watp ?? null,
    date: p.date ?? "",
    dealType: p.dealType,
  };
}

describe("filterDeals", () => {
  const deals = [
    deal({ symbol: "AAA", dealType: "bulk", side: "BUY", name: "Alpha", clientName: "LIC" }),
    deal({ symbol: "BBB", dealType: "bulk", side: "SELL", name: "Beta" }),
    deal({ symbol: "CCC", dealType: "block", side: "BUY" }),
  ];
  it("filters by deal type (tab)", () => {
    expect(filterDeals(deals, { dealType: "block", side: "all", query: "" }).map((d) => d.symbol)).toEqual(["CCC"]);
  });
  it("filters by side", () => {
    expect(filterDeals(deals, { dealType: "bulk", side: "SELL", query: "" }).map((d) => d.symbol)).toEqual(["BBB"]);
  });
  it("query matches symbol, company, or client (case-insensitive)", () => {
    expect(filterDeals(deals, { dealType: "bulk", side: "all", query: "lic" }).map((d) => d.symbol)).toEqual(["AAA"]);
    expect(filterDeals(deals, { dealType: "bulk", side: "all", query: "beta" }).map((d) => d.symbol)).toEqual(["BBB"]);
  });
});

describe("dealSymbolSet", () => {
  it("collects distinct symbols", () => {
    const set = dealSymbolSet([deal({ symbol: "AAA", dealType: "bulk" }), deal({ symbol: "AAA", dealType: "block" }), deal({ symbol: "BBB", dealType: "bulk" })]);
    expect([...set].sort()).toEqual(["AAA", "BBB"]);
  });
});
