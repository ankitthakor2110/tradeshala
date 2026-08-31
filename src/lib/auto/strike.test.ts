import { describe, it, expect } from "vitest";
import { selectStrike, moneynessStrike, inferStrikeStep } from "./strike";
import type { StrikeCandidate } from "@/types/autoTrade";

// Chain used across delta tests (spec section 8 example):
//   24400 → 0.72, 24500 → 0.63, 24600 → 0.51, 24700 → 0.39
const ceCandidates: StrikeCandidate[] = [
  { strike: 24400, delta: 0.72, ltp: 180, bid: 179, ask: 181 },
  { strike: 24500, delta: 0.63, ltp: 140, bid: 139, ask: 141 },
  { strike: 24600, delta: 0.51, ltp: 105, bid: 104, ask: 106 },
  { strike: 24700, delta: 0.39, ltp: 78, bid: 77, ask: 79 },
];

const base = {
  candidates: ceCandidates,
  atmStrike: 24600,
  strikeStep: 100,
  targetDelta: 0.6,
  maxDeltaDifference: 0.05,
  fallback: "SKIP" as const,
  offset: 0,
  itmOtmSteps: 1,
};

describe("selectStrike — DELTA", () => {
  it("selects the strike whose |delta| is closest to target (0.60 → 24500 @ 0.63)", () => {
    const r = selectStrike({ ...base, method: "DELTA", optionType: "CE" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strike).toBe(24500);
  });

  it("rejects when nothing is within tolerance and fallback = SKIP", () => {
    // target 0.60, tolerance 0.05, but only 0.70 available → reject
    const r = selectStrike({
      ...base,
      method: "DELTA",
      optionType: "CE",
      candidates: [{ strike: 24400, delta: 0.7, ltp: 180, bid: 179, ask: 181 }],
    });
    expect(r.ok).toBe(false);
  });

  it("uses the closest strike when fallback = CLOSEST even if out of tolerance", () => {
    const r = selectStrike({
      ...base,
      method: "DELTA",
      optionType: "CE",
      fallback: "CLOSEST",
      candidates: [{ strike: 24400, delta: 0.7, ltp: 180, bid: 179, ask: 181 }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strike).toBe(24400);
  });

  it("uses absolute delta for PE (negative deltas)", () => {
    const pe: StrikeCandidate[] = [
      { strike: 24700, delta: -0.72, ltp: 180, bid: 179, ask: 181 },
      { strike: 24600, delta: -0.63, ltp: 140, bid: 139, ask: 141 },
      { strike: 24500, delta: -0.51, ltp: 105, bid: 104, ask: 106 },
    ];
    const r = selectStrike({ ...base, method: "DELTA", optionType: "PE", candidates: pe, atmStrike: 24600 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strike).toBe(24600); // |−0.63 − 0.60| = 0.03 smallest
  });

  it("skips when no greeks are present and fallback = SKIP (never invents delta)", () => {
    const noGreeks = ceCandidates.map((c) => ({ ...c, delta: 0 }));
    const r = selectStrike({ ...base, method: "DELTA", optionType: "CE", candidates: noGreeks });
    expect(r.ok).toBe(false);
  });

  it("falls back to ATM when no greeks and fallback = CLOSEST", () => {
    const noGreeks = ceCandidates.map((c) => ({ ...c, delta: 0 }));
    const r = selectStrike({ ...base, method: "DELTA", optionType: "CE", candidates: noGreeks, fallback: "CLOSEST" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strike).toBe(24600);
  });
});

describe("selectStrike — ATM / OFFSET", () => {
  it("ATM picks the ATM strike", () => {
    const r = selectStrike({ ...base, method: "ATM", optionType: "CE" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strike).toBe(24600);
  });

  it("OFFSET +1 → one step above ATM", () => {
    const r = selectStrike({ ...base, method: "OFFSET", optionType: "CE", offset: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strike).toBe(24700);
  });

  it("OFFSET -2 → two steps below ATM", () => {
    const r = selectStrike({ ...base, method: "OFFSET", optionType: "CE", offset: -2 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strike).toBe(24400);
  });
});

describe("selectStrike — ITM / OTM (side-aware)", () => {
  it("CE 1 ITM → below ATM", () => {
    const r = selectStrike({ ...base, method: "ITM", optionType: "CE", itmOtmSteps: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strike).toBe(24500);
  });

  it("CE 1 OTM → above ATM", () => {
    const r = selectStrike({ ...base, method: "OTM", optionType: "CE", itmOtmSteps: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strike).toBe(24700);
  });

  it("PE 1 ITM → above ATM (opposite of CE)", () => {
    const pe: StrikeCandidate[] = ceCandidates.map((c) => ({ ...c, delta: -c.delta }));
    const r = selectStrike({ ...base, method: "ITM", optionType: "PE", candidates: pe, itmOtmSteps: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strike).toBe(24700);
  });

  it("PE 1 OTM → below ATM", () => {
    const pe: StrikeCandidate[] = ceCandidates.map((c) => ({ ...c, delta: -c.delta }));
    const r = selectStrike({ ...base, method: "OTM", optionType: "PE", candidates: pe, itmOtmSteps: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.strike).toBe(24500);
  });
});

describe("moneynessStrike / inferStrikeStep", () => {
  it("CE ITM subtracts strikes, PE ITM adds strikes", () => {
    expect(moneynessStrike("CE", 24600, 100, 2)).toBe(24400);
    expect(moneynessStrike("PE", 24600, 100, 2)).toBe(24800);
  });

  it("infers the strike step from a strike ladder", () => {
    expect(inferStrikeStep([24400, 24500, 24600, 24700])).toBe(100);
    expect(inferStrikeStep([100])).toBe(0);
  });
});
