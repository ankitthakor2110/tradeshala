import { describe, it, expect } from "vitest";
import { evaluateChecklist, type ChecklistContext } from "./checklist";
import { INTEL_CONFIG } from "@/config/intel";

const bullish: ChecklistContext = {
  ltp: 24050,
  vwap: 24000,
  trend: "bullish",
  pcr: 1.4,
  openRangeHigh: 24030,
  openRangeLow: 23950,
  changePercent: 0.5,
  maxPain: 23980,
  oiSkewScore: 0.6,
  support: 23900,
  resistance: 24200,
};

describe("evaluateChecklist", () => {
  it("all-bullish context → READY_TO_BUY with longScore > shortScore", () => {
    const r = evaluateChecklist(bullish);
    expect(r.verdict).toBe("READY_TO_BUY");
    expect(r.longScore).toBeGreaterThan(r.shortScore);
    expect(r.longScore).toBeGreaterThanOrEqual(INTEL_CONFIG.checklist.minReady);
  });

  it("conflicting context → WAIT", () => {
    const r = evaluateChecklist({
      ...bullish,
      trend: "neutral",
      pcr: 1.0,
      changePercent: 0,
      oiSkewScore: 0,
      ltp: 24000,
      vwap: 24000,
    });
    expect(r.verdict).toBe("WAIT");
  });

  it("appends the unavailable rows as N/A without faking a pass", () => {
    const r = evaluateChecklist(bullish);
    const na = r.items.filter((i) => i.state === "na");
    expect(na.some((i) => i.key === "future-oi")).toBe(true);
    expect(na.some((i) => i.key === "order-block")).toBe(true);
    // N/A rows never count toward a side.
    expect(na.every((i) => i.favors === null)).toBe(true);
  });

  it("warming up (null OI skew) marks the OI-flow row N/A", () => {
    const r = evaluateChecklist({ ...bullish, oiSkewScore: null });
    expect(r.items.find((i) => i.key === "oiflow")!.state).toBe("na");
  });
});
