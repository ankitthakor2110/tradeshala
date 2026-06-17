"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LiveQuote } from "@/types/database";

export type LiveQuotesMap = Record<string, LiveQuote>;

let channelSeq = 0;

/**
 * Subscribes to live price updates for the given display symbols via Supabase
 * Realtime. The frontend updates automatically as the server-side snapshot
 * writer upserts into `live_quotes` — no client-side polling.
 *
 * The streamed universe is small, so we subscribe to the whole table and
 * filter to the requested symbols on the client.
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
  const wantedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const wanted = new Set(key ? key.split("|") : []);
    wantedRef.current = wanted;

    if (wanted.size === 0) {
      setQuotes({});
      setIsLive(false);
      return;
    }

    const supabase = createClient();
    let active = true;

    // One-time fetch of current rows for first paint.
    (async () => {
      const { data } = await supabase
        .from("live_quotes")
        .select("*")
        .in("symbol", Array.from(wanted))
        .returns<LiveQuote[]>();
      if (!active || !data) return;
      const next: LiveQuotesMap = {};
      for (const row of data) next[row.symbol] = row;
      setQuotes((prev) => ({ ...prev, ...next }));
    })();

    const channel = supabase
      .channel(`live_quotes_${channelSeq++}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_quotes" },
        (payload) => {
          const row = payload.new as LiveQuote;
          if (!row?.symbol || !wantedRef.current.has(row.symbol)) return;
          setQuotes((prev) => ({ ...prev, [row.symbol]: row }));
        }
      )
      .subscribe((status) => {
        if (active) setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [key]);

  return { quotes, isLive };
}
