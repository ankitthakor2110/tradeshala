"use client";

import { useEffect, useRef, useState } from "react";
import {
  acquireQuotes,
  onQuotesChange,
  isQuotesLive,
  getLiveQuote,
  primeQuotes,
} from "@/lib/supabase/realtime-quotes";
import type { LiveQuote } from "@/types/database";

export type LiveQuotesMap = Record<string, LiveQuote>;

/**
 * Live prices for the given display symbols. Reads from the shared Realtime
 * store (one channel for all price subscriptions — see realtime-quotes.ts), so
 * the frontend updates automatically as the snapshot/stream writers upsert into
 * `live_quotes`. No client-side polling.
 *
 * @returns `quotes` keyed by symbol, and `isLive` (Realtime channel connected).
 */
export function useLiveQuotes(symbols: string[]): {
  quotes: LiveQuotesMap;
  isLive: boolean;
} {
  // Stable dependency: identity of `symbols` changes every render.
  const key = [...symbols].sort().join("|");
  const [quotes, setQuotes] = useState<LiveQuotesMap>({});
  const [isLive, setIsLive] = useState(false);
  const wantedRef = useRef<string[]>([]);

  // Keep the shared channel open while any quote hook is mounted.
  useEffect(() => acquireQuotes(), []);

  useEffect(() => {
    const wanted = key ? key.split("|") : [];
    wantedRef.current = wanted;
    let active = true;

    // Rebuild this hook's slice from the store; bail the re-render when nothing
    // it cares about changed (so an unrelated symbol's tick is a no-op here).
    const recompute = () => {
      if (!active) return;
      setQuotes((prev) => {
        const next: LiveQuotesMap = {};
        for (const s of wantedRef.current) {
          const q = getLiveQuote(s);
          if (q) next[s] = q;
        }
        const pk = Object.keys(prev);
        const nk = Object.keys(next);
        if (pk.length === nk.length && nk.every((k) => prev[k] === next[k])) return prev;
        return next;
      });
      setIsLive(isQuotesLive());
    };

    const unsub = onQuotesChange(recompute);
    void primeQuotes(wanted).then(() => recompute());

    return () => {
      active = false;
      unsub();
    };
  }, [key]);

  return { quotes, isLive };
}
