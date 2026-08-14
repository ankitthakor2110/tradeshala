import { describe, it, expect } from "vitest";
import { updateVolumeState, volumeSurges, type VolumeState } from "./volume";
import type { MarketData } from "@/types/database";

const q = (symbol: string, volume: number): MarketData => ({
  symbol,
  exchange: "NSE",
  last_price: 100,
  open_price: 100,
  high_price: 101,
  low_price: 99,
  close_price: 100,
  change: 0,
  change_percent: 0,
  volume,
  last_updated: "",
});

const MIN = 60_000;

/** Feed a series of (volume, minute-offset) samples for one symbol. */
function feed(series: Array<[number, number]>, symbol = "AAA"): VolumeState {
  let state: VolumeState = {};
  for (const [vol, min] of series) {
    state = updateVolumeState(state, [q(symbol, vol)], min * MIN);
  }
  return state;
}

describe("updateVolumeState", () => {
  it("records nothing on the first sample (no interval yet)", () => {
    const state = feed([[1000, 0]]);
    expect(state.AAA.rates).toEqual([]);
    expect(state.AAA.lastVolume).toBe(1000);
  });

  it("computes Δvolume / Δminute as the interval rate", () => {
    const state = feed([
      [1000, 0],
      [1600, 1], // +600 over 1 min → 600/min
    ]);
    expect(state.AAA.rates).toEqual([600]);
  });

  it("resets a symbol when cumulative volume drops (new session)", () => {
    const state = feed([
      [5000, 0],
      [6000, 1],
      [200, 2], // volume went backwards → reset
    ]);
    expect(state.AAA.rates).toEqual([]);
    expect(state.AAA.lastVolume).toBe(200);
  });

  it("ignores zero-elapsed / duplicate readings without corrupting history", () => {
    const state = feed([
      [1000, 0],
      [1600, 1], // rate 600
      [1600, 1], // same ts + same volume → no new sample
    ]);
    expect(state.AAA.rates).toEqual([600]);
  });

  it("caps the rolling window to maxSamples", () => {
    let state: VolumeState = {};
    for (let i = 1; i <= 40; i++) {
      state = updateVolumeState(state, [q("AAA", i * 100)], i * MIN, 30);
    }
    expect(state.AAA.rates.length).toBe(30);
  });

  it("returns a new object (immutable) and leaves the prior untouched", () => {
    const first = feed([[1000, 0]]);
    const second = updateVolumeState(first, [q("AAA", 1600)], 1 * MIN);
    expect(second).not.toBe(first);
    expect(first.AAA.rates).toEqual([]);
  });
});

describe("volumeSurges", () => {
  it("does not flag until minSamples prior intervals exist", () => {
    // 3 rates recorded; minSamples=3 needs 4 (3 prior + 1 current).
    const state = feed([
      [1000, 0],
      [1100, 1], // 100
      [1200, 2], // 100
      [2000, 3], // 800 — a spike, but not enough history yet
    ]);
    expect(volumeSurges(state, 3, 3).has("AAA")).toBe(false);
  });

  it("flags a symbol whose recent rate outpaces its session baseline", () => {
    const state = feed([
      [1000, 0],
      [1100, 1], // 100
      [1200, 2], // 100
      [1300, 3], // 100  (baseline of priors ≈ 100)
      [1900, 4], // 600 → 6x baseline
    ]);
    const surges = volumeSurges(state, 3, 3);
    expect(surges.has("AAA")).toBe(true);
    expect(surges.get("AAA")).toBeCloseTo(6, 5);
  });

  it("does not flag steady volume", () => {
    const state = feed([
      [1000, 0],
      [1100, 1],
      [1200, 2],
      [1300, 3],
      [1400, 4],
    ]);
    expect(volumeSurges(state, 3, 3).has("AAA")).toBe(false);
  });
});
