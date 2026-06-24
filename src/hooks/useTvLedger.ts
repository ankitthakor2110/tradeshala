"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getTvOpenPositions, getTvClosedTrades } from "@/services/tradingview.service";
import { TV_DASHBOARD_COPY } from "@/config/tradingview";
import type { TvPosition, TvTrade } from "@/types/tradingview";

// Polls the TradingView ledger every few seconds (no provider feed — the data
// only changes when a webhook fires). Pauses while the tab is hidden. The spec
// allows websocket OR polling; polling keeps it simple and dependency-free.

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

  return { open, closed, loading, lastUpdated, refresh };
}
