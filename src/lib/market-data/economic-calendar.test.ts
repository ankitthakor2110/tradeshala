import { describe, it, expect } from "vitest";
import { mapFmpEvents, fmpDateToIso, type FmpEconomicEvent } from "./economic-calendar";

const row = (over: Partial<FmpEconomicEvent>): FmpEconomicEvent => ({
  date: "2026-08-13 12:30:00",
  country: "US",
  event: "Inflation Rate YoY",
  impact: "High",
  ...over,
});

describe("fmpDateToIso", () => {
  it("pins FMP's UTC datetime to an ISO instant", () => {
    expect(fmpDateToIso("2026-08-13 12:30:00")).toBe("2026-08-13T12:30:00Z");
  });

  it("tolerates a missing seconds component", () => {
    expect(fmpDateToIso("2026-08-13 12:30")).toBe("2026-08-13T12:30:00Z");
  });

  it("returns null for a malformed value", () => {
    expect(fmpDateToIso("not-a-date")).toBeNull();
    expect(fmpDateToIso("")).toBeNull();
  });
});

describe("mapFmpEvents", () => {
  it("maps a high-impact US print into a RawEvent", () => {
    const [e] = mapFmpEvents([row({})]);
    expect(e).toMatchObject({
      label: "US: Inflation Rate YoY",
      category: "US Macro",
      impact: "high",
      at: "2026-08-13T12:30:00Z",
    });
    expect(e.id).toContain("fmp-US-inflation-rate-yoy");
  });

  it("drops low-impact and 'None' prints (they don't gate a scalp)", () => {
    const out = mapFmpEvents([row({ impact: "Low" }), row({ impact: "None" })]);
    expect(out).toHaveLength(0);
  });

  it("keeps medium impact", () => {
    const [e] = mapFmpEvents([row({ impact: "Medium" })]);
    expect(e.impact).toBe("medium");
  });

  it("filters out countries that don't move Indian indices", () => {
    const out = mapFmpEvents([row({ country: "AU" }), row({ country: "BR" })]);
    expect(out).toHaveLength(0);
  });

  it("keeps India and EU alongside US", () => {
    const out = mapFmpEvents([
      row({ country: "IN", event: "RBI Interest Rate Decision" }),
      row({ country: "EU", event: "ECB Rate" }),
    ]);
    expect(out.map((e) => e.category).sort()).toEqual(["EU Macro", "IN Macro"]);
  });

  it("respects a custom country allowlist", () => {
    const out = mapFmpEvents([row({ country: "IN" })], ["IN"]);
    expect(out).toHaveLength(1);
    expect(mapFmpEvents([row({ country: "US" })], ["IN"])).toHaveLength(0);
  });

  it("skips rows with a malformed date or empty event", () => {
    const out = mapFmpEvents([row({ date: "garbage" }), row({ event: "  " })]);
    expect(out).toHaveLength(0);
  });
});
