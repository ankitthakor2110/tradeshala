import type { MarketData } from "@/types/database";

// Self-computed "unusual volume" — pure, unit-tested. The providers give only a
// cumulative daily `volume`, no historical average, and equity candles are mock,
// so we can't honestly compute "relative volume vs the 20-day avg". Instead we
// mirror the Intel dashboard's OI-diff approach: track volume across successive
// live polls and detect when the RECENT interval's volume rate accelerates well
// past this session's own running pace. Everything is derived from real readings
// — no fabrication. The baseline builds during the session and resets on reload
// (a cold start reports no surge until enough samples accrue).

export interface SymbolVolumeState {
  lastVolume: number;
  lastTs: number; // ms
  /** Per-interval volume rates (Δvolume / Δminute), oldest → newest. */
  rates: number[];
}

export type VolumeState = Record<string, SymbolVolumeState>;

const MAX_SAMPLES = 30;

/**
 * Fold a fresh batch of quotes into the volume state, returning a NEW state
 * (immutable — safe to hold in React state). For each symbol we add one interval
 * rate = (volume - lastVolume) / minutes-elapsed. A drop in cumulative volume
 * (new session) or a non-positive interval resets that symbol's history.
 */
export function updateVolumeState(
  prev: VolumeState,
  rows: MarketData[],
  nowMs: number,
  maxSamples = MAX_SAMPLES
): VolumeState {
  const next: VolumeState = { ...prev };

  for (const r of rows) {
    const vol = r.volume;
    if (!(vol > 0)) continue; // no volume yet (pre-open / illiquid) — nothing to measure
    const prior = next[r.symbol];

    if (!prior) {
      next[r.symbol] = { lastVolume: vol, lastTs: nowMs, rates: [] };
      continue;
    }

    const deltaVol = vol - prior.lastVolume;
    const deltaMin = (nowMs - prior.lastTs) / 60_000;

    // Volume reset (new session) → start fresh from this reading.
    if (deltaVol < 0) {
      next[r.symbol] = { lastVolume: vol, lastTs: nowMs, rates: [] };
      continue;
    }
    // Same reading / no time elapsed → keep history, don't add a noisy sample.
    if (deltaMin <= 0 || deltaVol === 0) {
      next[r.symbol] = { ...prior, lastVolume: vol, lastTs: nowMs };
      continue;
    }

    const rate = deltaVol / deltaMin;
    const rates = [...prior.rates, rate].slice(-maxSamples);
    next[r.symbol] = { lastVolume: vol, lastTs: nowMs, rates };
  }

  return next;
}

/**
 * Surge ratios per symbol: the most recent interval rate divided by the average
 * of the PRIOR rates this session. A symbol is flagged only when it has at least
 * `minSamples` intervals recorded and the ratio meets `threshold`, so a warming-
 * up baseline never false-positives. Returns `symbol → ratio` for flagged names.
 */
export function volumeSurges(
  state: VolumeState,
  threshold: number,
  minSamples: number
): Map<string, number> {
  const out = new Map<string, number>();

  for (const [symbol, s] of Object.entries(state)) {
    // Need `minSamples` prior intervals PLUS the current one to compare.
    if (s.rates.length < minSamples + 1) continue;

    const recent = s.rates[s.rates.length - 1];
    const prior = s.rates.slice(0, -1);
    const baseline = prior.reduce((a, b) => a + b, 0) / prior.length;
    if (!(baseline > 0)) continue;

    const ratio = recent / baseline;
    if (ratio >= threshold) out.set(symbol, ratio);
  }

  return out;
}
