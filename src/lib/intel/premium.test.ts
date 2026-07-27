import { describe, it, expect } from "vitest";
import { calculatePremiumBehaviour } from "./premium";

describe("calculatePremiumBehaviour", () => {
  it("null deltas → insufficient", () => {
    const r = calculatePremiumBehaviour({ ceLtp: 100, peLtp: 100, ceLtpDelta: null, peLtpDelta: null });
    expect(r.insufficient).toBe(true);
    expect(r.ce.changePct).toBeNull();
  });

  it("put premium falling + call rising → strong bullish", () => {
    const r = calculatePremiumBehaviour({ ceLtp: 100, peLtp: 100, ceLtpDelta: 8, peLtpDelta: -8 });
    expect(r.tone).toBe("bullish");
    expect(r.pe.direction).toBe("decreasing");
    expect(r.ce.direction).toBe("increasing");
  });

  it("fast put decay → put sellers comfortable (bullish)", () => {
    const r = calculatePremiumBehaviour({ ceLtp: 100, peLtp: 100, ceLtpDelta: 0, peLtpDelta: -20 });
    expect(r.pe.direction).toBe("fast-decay");
    expect(r.tone).toBe("bullish");
  });

  it("fast call decay → call sellers comfortable (bearish)", () => {
    const r = calculatePremiumBehaviour({ ceLtp: 100, peLtp: 100, ceLtpDelta: -20, peLtpDelta: 0 });
    expect(r.ce.direction).toBe("fast-decay");
    expect(r.tone).toBe("bearish");
  });

  it("tiny moves read flat", () => {
    const r = calculatePremiumBehaviour({ ceLtp: 100, peLtp: 100, ceLtpDelta: 1, peLtpDelta: -1 });
    expect(r.ce.direction).toBe("flat");
    expect(r.pe.direction).toBe("flat");
  });
});
