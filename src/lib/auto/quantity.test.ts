import { describe, it, expect } from "vitest";
import { computeQuantity } from "./quantity";

describe("computeQuantity", () => {
  it("LOTS: 1 lot × 65 → 65", () => {
    expect(computeQuantity({ mode: "LOTS", lots: 1, fixedQty: 0, riskAmount: 0, lotSize: 65, stopDistance: 0 })).toEqual({
      quantity: 65,
      lots: 1,
    });
  });
  it("LOTS: 2 lots × 30 → 60", () => {
    expect(computeQuantity({ mode: "LOTS", lots: 2, fixedQty: 0, riskAmount: 0, lotSize: 30, stopDistance: 0 })).toEqual({
      quantity: 60,
      lots: 2,
    });
  });
  it("FIXED: 150 with lot 65 → rounds down to 2 lots (130)", () => {
    expect(
      computeQuantity({ mode: "FIXED", lots: 0, fixedQty: 150, riskAmount: 0, lotSize: 65, stopDistance: 0 })
    ).toEqual({ quantity: 130, lots: 2 });
  });
  it("FIXED: below one lot still takes one lot", () => {
    expect(computeQuantity({ mode: "FIXED", lots: 0, fixedQty: 10, riskAmount: 0, lotSize: 65, stopDistance: 0 })).toEqual({
      quantity: 65,
      lots: 1,
    });
  });
  it("RISK: ₹5000 budget, stop distance 25/unit, lot 65 → floor to whole lots", () => {
    // 5000/25 = 200 units → floor(200/65)=3 lots → 195
    expect(
      computeQuantity({ mode: "RISK", lots: 0, fixedQty: 0, riskAmount: 5000, lotSize: 65, stopDistance: 25 })
    ).toEqual({ quantity: 195, lots: 3 });
  });
  it("RISK: tiny budget still takes at least one lot", () => {
    expect(
      computeQuantity({ mode: "RISK", lots: 0, fixedQty: 0, riskAmount: 100, lotSize: 65, stopDistance: 25 })
    ).toEqual({ quantity: 65, lots: 1 });
  });
});
