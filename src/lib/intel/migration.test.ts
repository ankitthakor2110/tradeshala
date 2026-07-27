import { describe, it, expect } from "vitest";
import { calculateStrikeMigration } from "./migration";

describe("calculateStrikeMigration", () => {
  it("missing baseline → insufficient", () => {
    const r = calculateStrikeMigration({ prevSupport: null, prevResistance: null, currSupport: 100, currResistance: 200 });
    expect(r.insufficient).toBe(true);
  });

  it("support shifted higher → bullish", () => {
    const r = calculateStrikeMigration({ prevSupport: 23800, prevResistance: 24000, currSupport: 23900, currResistance: 24000 });
    expect(r.supportShift).toBe("higher");
    expect(r.tone).toBe("bullish");
  });

  it("both levels up → strong institutional buying (bullish)", () => {
    const r = calculateStrikeMigration({ prevSupport: 23800, prevResistance: 24000, currSupport: 23900, currResistance: 24100 });
    expect(r.tone).toBe("bullish");
    expect(r.resistanceShift).toBe("higher");
  });

  it("both levels down → bearish", () => {
    const r = calculateStrikeMigration({ prevSupport: 23900, prevResistance: 24100, currSupport: 23800, currResistance: 24000 });
    expect(r.tone).toBe("bearish");
  });

  it("no change → neutral", () => {
    const r = calculateStrikeMigration({ prevSupport: 23800, prevResistance: 24000, currSupport: 23800, currResistance: 24000 });
    expect(r.supportShift).toBe("none");
    expect(r.tone).toBe("neutral");
  });
});
