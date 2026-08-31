import { describe, it, expect } from "vitest";
import { rowToDeal, rowsToResponse } from "./large-deals-store";
import type { LargeDealRow } from "@/types/database";

const row = (over: Partial<LargeDealRow> = {}): LargeDealRow => ({
  id: 1,
  deal_type: "bulk",
  symbol: "RELIANCE",
  name: "Reliance Industries",
  client_name: "SOME FUND",
  side: "BUY",
  qty: 72000,
  watp: 24.9,
  deal_date: "07-Aug-2026",
  as_on: "07-Aug-2026",
  fetched_at: "2026-08-07T10:00:00Z",
  ...over,
});

describe("rowToDeal", () => {
  it("maps a stored row to the client-facing deal shape", () => {
    expect(rowToDeal(row())).toEqual({
      symbol: "RELIANCE",
      name: "Reliance Industries",
      clientName: "SOME FUND",
      side: "BUY",
      qty: 72000,
      watp: 24.9,
      date: "07-Aug-2026",
      dealType: "bulk",
    });
  });

  it("preserves a null side and null watp (short deals)", () => {
    const d = rowToDeal(row({ deal_type: "short", side: null, watp: null }));
    expect(d.side).toBeNull();
    expect(d.watp).toBeNull();
    expect(d.dealType).toBe("short");
  });
});

describe("rowsToResponse", () => {
  it("reports unavailable for an empty snapshot", () => {
    expect(rowsToResponse([])).toEqual({ deals: [], asOn: null, source: "unavailable" });
  });

  it("reports nse + the head as-on date for a populated snapshot", () => {
    const res = rowsToResponse([row({ as_on: "07-Aug-2026" }), row({ id: 2, symbol: "TCS" })]);
    expect(res.source).toBe("nse");
    expect(res.asOn).toBe("07-Aug-2026");
    expect(res.deals.map((d) => d.symbol)).toEqual(["RELIANCE", "TCS"]);
  });
});
