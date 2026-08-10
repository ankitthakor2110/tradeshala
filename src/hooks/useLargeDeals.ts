"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLargeDeals } from "@/services/finder.service";
import { dealSymbolSet } from "@/lib/finder/deals";
import { FINDER_CONFIG } from "@/config/finder";
import type { LargeDeal } from "@/types/finder";

/**
 * NSE large-deals loader for the Trade Finder. Polls slowly (deals change only
 * through the day) and pauses on a hidden tab; also exposes the set of symbols
 * with a deal so the screener can cross-tag them.
 */
export function useLargeDeals() {
  const [deals, setDeals] = useState<LargeDeal[]>([]);
  const [asOn, setAsOn] = useState<string | null>(null);
  const [source, setSource] = useState<"nse" | "unavailable">("unavailable");
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await getLargeDeals();
      if (res) {
        setDeals(res.deals);
        setAsOn(res.asOn);
        setSource(res.source);
      }
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
    const id = setInterval(tick, FINDER_CONFIG.largeDeals.refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [poll]);

  const refresh = useCallback(() => void poll(), [poll]);
  const symbols = dealSymbolSet(deals);

  return { deals, asOn, source, loading, symbols, refresh };
}
