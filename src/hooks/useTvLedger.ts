"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getTvOpenPositions, getTvClosedTrades } from "@/services/tradingview.service";
import { createClient } from "@/lib/supabase/client";
import { TV_DASHBOARD_COPY } from "@/config/tradingview";
import type { TvPosition, TvTrade } from "@/types/tradingview";

// Keeps the TradingView ledger fresh two ways: a Supabase Realtime subscription
// on tv_positions/tv_trades for near-instant updates when a webhook fires, plus
// a slow poll as a fallback in case Realtime isn't enabled on those tables.
// Polling pauses while the tab is hidden.

export interface TvLedgerState {
  open: TvPosition[];
  closed: TvTrade[];
  loading: boolean;
  lastUpdated: string;
  refresh: () => Promise<void>;
}

export function useTvLedger(): TvLedgerState {
  const [open, setOpen] = useState<TvPosition[]>([]);
  const [closed, setClosed] = useState<TvTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const [o, c] = await Promise.all([getTvOpenPositions(), getTvClosedTrades()]);
      setOpen(o);
      setClosed(c);
      setLastUpdated(new Date().toISOString());
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refresh();
    }, TV_DASHBOARD_COPY.pollIntervalMs);
    return () => clearInterval(id);
  }, [refresh]);

  // Instant updates when a webhook writes the ledger (requires Realtime enabled
  // on tv_positions/tv_trades; the poll above covers it otherwise).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("tv_ledger")
      .on("postgres_changes", { event: "*", schema: "public", table: "tv_positions" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "tv_trades" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { open, closed, loading, lastUpdated, refresh };
}
