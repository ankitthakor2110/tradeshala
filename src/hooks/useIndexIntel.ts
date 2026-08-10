"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getChain, getExpiriesFor } from "@/services/intel.service";
import { computePCR, maxPain, extremeOi } from "@/lib/intel/optionchain";
import { indexConviction, type Conviction } from "@/lib/finder/rank";
import { INTEL_CONFIG } from "@/config/intel";

export type IndexBias = "bullish" | "bearish" | "neutral";

export interface IndexIntelRow {
  key: string;
  label: string;
  underlying: number;
  atmStrike: number;
  pcr: number;
  bias: IndexBias;
  maxPain: number;
  support: number;
  resistance: number;
  conviction: Conviction;
  /** Real when "dhan"/"upstox"; "mock" means no live chain (never shown as real). */
  source: "dhan" | "upstox" | "mock";
}

function biasFromPcr(pcr: number): IndexBias {
  if (pcr >= INTEL_CONFIG.sentiment.pcrBullish) return "bullish";
  if (pcr <= INTEL_CONFIG.sentiment.pcrBearish) return "bearish";
  return "neutral";
}

/**
 * Compact, honest index snapshot for the Trade Finder. For each supported index
 * it fetches ONE live option chain and derives the headline positioning metrics
 * that need no session history: PCR, bias, max pain, and the OI-defended
 * support/resistance. Deeper engine metrics (writer control, readiness, score)
 * require accumulated session deltas + candles and live in the full deep-dive
 * (`/dashboard/intel?symbol=…`), one click away. Rows carry their chain source so
 * the UI badges mock chains honestly rather than dressing them up as live.
 */
export function useIndexIntel(refreshMs = 20000) {
  const [rows, setRows] = useState<IndexIntelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const expiryRef = useRef<Record<string, string>>({});
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const results = await Promise.all(
        INTEL_CONFIG.symbols.map(async (s): Promise<IndexIntelRow | null> => {
          let expiry = expiryRef.current[s.key];
          if (!expiry) {
            const xs = await getExpiriesFor(s.key);
            if (xs.length) {
              expiry = xs[0];
              expiryRef.current[s.key] = expiry;
            }
          }
          if (!expiry) return null;

          const chain = await getChain(s.key, expiry);
          if (!chain || !chain.chain.length) return null;

          const pcr = computePCR(chain.chain);
          const mp = maxPain(chain.chain);
          return {
            key: s.key,
            label: s.label,
            underlying: chain.underlyingPrice,
            atmStrike: chain.atmStrike,
            pcr,
            bias: biasFromPcr(pcr),
            maxPain: mp,
            support: extremeOi(chain.chain, "pe").strike,
            resistance: extremeOi(chain.chain, "ce").strike,
            conviction: indexConviction(
              { pcr, underlying: chain.underlyingPrice, maxPain: mp },
              INTEL_CONFIG.sentiment.pcrBullish,
              INTEL_CONFIG.sentiment.pcrBearish
            ),
            source: chain.source,
          };
        })
      );
      // Rank: live chains first, highest conviction on top.
      const out = results.filter((r): r is IndexIntelRow => r !== null);
      out.sort((a, b) => {
        const aReal = a.source !== "mock" ? 1 : 0;
        const bReal = b.source !== "mock" ? 1 : 0;
        if (aReal !== bReal) return bReal - aReal;
        return b.conviction.score - a.conviction.score;
      });
      setRows(out);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void poll();
    };
    tick();
    const id = setInterval(tick, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [poll, refreshMs]);

  return { rows, loading };
}
