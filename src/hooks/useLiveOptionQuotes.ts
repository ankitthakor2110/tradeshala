"use client";

import { useEffect, useRef, useState } from "react";
import {
  acquireQuotes,
  onQuotesChange,
  isQuotesLive,
  getLiveOptionQuote,
  primeOptionQuotes,
} from "@/lib/supabase/realtime-quotes";
import { registerOptionStream } from "@/services/market-data.service";
import type { LiveQuote } from "@/types/database";

// Option ticks ride the live_quotes stream (keyed by instrument_key), so quotes
// are LiveQuote rows — consumers read ltp / change / change_percent.
export type OptionQuotesMap = Record<string, LiveQuote>; // keyed by instrument_key

interface StreamContract {
  instrument_key: string;
  symbol: string;
  expiry: string;
  strike: number;
  option_type: "CE" | "PE";
}

const HEARTBEAT_MS = 10_000; // re-register so the worker keeps streaming these

/**
 * Streams LTP for a set of option contracts. Registers them with the server (so
 * the WebSocket worker subscribes) and reads their live ticks from the shared
 * Realtime store. The trade page / positions overlay this onto their data.
 *
 * Pass the contracts in view (ATM±N, or held positions). Registration heartbeats
 * every 10s; the worker drops contracts no longer requested.
 */
export function useLiveOptionQuotes(contracts: StreamContract[]): {
  quotes: OptionQuotesMap;
  isLive: boolean;
} {
  const keyId = [...contracts.map((c) => c.instrument_key).filter(Boolean)].sort().join("|");
  const [quotes, setQuotes] = useState<OptionQuotesMap>({});
  const [isLive, setIsLive] = useState(false);
  const wantedRef = useRef<string[]>([]);
  const contractsRef = useRef<StreamContract[]>([]);
  useEffect(() => {
    contractsRef.current = contracts;
  });

  // Keep the shared channel open while mounted.
  useEffect(() => acquireQuotes(), []);

  // Register the contracts with the server (heartbeat keeps them active). Not
  // gated on tab visibility — held positions / open chains keep streaming for
  // accurate P&L; the worker's TTL + unmount cleanup stop it once all tabs close.
  useEffect(() => {
    if (!keyId) return;
    let cancelled = false;
    const register = () => {
      void registerOptionStream(contractsRef.current.filter((c) => c.instrument_key));
    };
    register();
    const id = setInterval(() => {
      if (!cancelled) register();
    }, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [keyId]);

  // Read the wanted contracts' ticks from the shared store.
  useEffect(() => {
    const wanted = keyId ? keyId.split("|") : [];
    wantedRef.current = wanted;
    let active = true;

    const recompute = () => {
      if (!active) return;
      setQuotes((prev) => {
        const next: OptionQuotesMap = {};
        for (const k of wantedRef.current) {
          const q = getLiveOptionQuote(k);
          if (q) next[k] = q;
        }
        const pk = Object.keys(prev);
        const nk = Object.keys(next);
        if (pk.length === nk.length && nk.every((k) => prev[k] === next[k])) return prev;
        return next;
      });
      setIsLive(isQuotesLive());
    };

    const unsub = onQuotesChange(recompute);
    void primeOptionQuotes(wanted).then(() => recompute());

    return () => {
      active = false;
      unsub();
    };
  }, [keyId]);

  return { quotes, isLive };
}
