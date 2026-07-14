import { describe, it, expect } from "vitest";
import { classifyLeg, tagMoneyness, computePCR, maxPain, extremeOi } from "./optionchain";
import type { OptionChainData, OptionLeg } from "@/types/database";

const TH = { minOiChange: 1000, minLtpChange: 0.05 };

function leg(oi: number, ltp = 100): OptionLeg {
  return {
    ltp, change: 0, changePercent: 0, bid: 0, ask: 0, bidAskSpread: 0,
    oi, oiChange: 0, oiChangePercent: 0, volume: 0, iv: 0,
    delta: 0, gamma: 0, theta: 0, vega: 0,
  };
}

function row(strike: number, ceOi: number, peOi: number): OptionChainData {
  return { strike_price: strike, ce: leg(ceOi), pe: leg(peOi), pcr: 0, totalCeOI: 0, totalPeOI: 0 };
}

describe("classifyLeg", () => {
  it("OI up + price up → long build-up (either side)", () => {
    expect(classifyLeg("ce", 5000, 2, TH)).toBe("long-buildup");
    expect(classifyLeg("pe", 5000, 2, TH)).toBe("long-buildup");
  });
  it("OI up + price down → fresh writing, side-aware", () => {
    expect(classifyLeg("ce", 5000, -2, TH)).toBe("fresh-call-writing");
    expect(classifyLeg("pe", 5000, -2, TH)).toBe("fresh-put-writing");
  });
  it("OI down + price up → short covering", () => {
    expect(classifyLeg("ce", -5000, 2, TH)).toBe("short-covering");
    expect(classifyLeg("pe", -5000, 2, TH)).toBe("short-covering");
  });
  it("OI down + price down → unwinding, side-aware", () => {
    expect(classifyLeg("ce", -5000, -2, TH)).toBe("call-unwinding");
    expect(classifyLeg("pe", -5000, -2, TH)).toBe("put-unwinding");
  });
  it("below the noise floor → neutral, and null (warming up) → neutral", () => {
    expect(classifyLeg("ce", 100, 0.01, TH)).toBe("neutral");
    expect(classifyLeg("ce", null, null, TH)).toBe("neutral");
  });
});

describe("tagMoneyness", () => {
  it("tags calls: below spot ITM, above OTM", () => {
    expect(tagMoneyness(24000, 24100, 24150, "ce")).toBe("ITM");
    expect(tagMoneyness(24200, 24100, 24150, "ce")).toBe("OTM");
    expect(tagMoneyness(24100, 24100, 24150, "ce")).toBe("ATM");
  });
  it("tags puts: above spot ITM, below OTM", () => {
    expect(tagMoneyness(24200, 24100, 24150, "pe")).toBe("ITM");
    expect(tagMoneyness(24000, 24100, 24150, "pe")).toBe("OTM");
  });
});

describe("computePCR / extremeOi / maxPain", () => {
  const chain = [row(24000, 100, 900), row(24100, 500, 500), row(24200, 900, 100)];

  it("PCR = total put OI / total call OI", () => {
    // put 1500 / call 1500 = 1
    expect(computePCR(chain)).toBe(1);
  });

  it("finds the max-OI strike per side", () => {
    expect(extremeOi(chain, "ce")).toEqual({ strike: 24200, oi: 900 });
    expect(extremeOi(chain, "pe")).toEqual({ strike: 24000, oi: 900 });
  });

  it("max pain sits where writer payout is minimized", () => {
    // Puts heavy low, calls heavy high → pain gravitates to the middle strike.
    expect(maxPain(chain)).toBe(24100);
  });
});
