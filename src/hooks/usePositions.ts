"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "@/services/auth.service";
import {
  getOpenPositions,
  getClosedPositions,
  summarizePositions,
} from "@/services/positions.service";
import { useLiveQuotes } from "./useLiveQuotes";
import { getOptionLtpMap } from "@/services/market-data.service";
import type { Position, PositionSummary } from "@/types/database";

// How often to refresh option premiums (not on the Realtime underlying feed).
const OPTION_POLL_MS = 7000;

/**
 * View model for the positions table: same fields as the DB Position, but with
 * current_price / current_value guaranteed non-null (coalesced) so the existing
 * render doesn't have to null-check.
 */
export interface PositionView
  extends Omit<Position, "current_price" | "current_value"> {
  current_price: number;
  current_value: number;
}

function toView(p: Position): PositionView {
  const ltp = p.current_price ?? p.average_price;
  const cv = p.current_value ?? p.quantity * ltp;
  const dirMul = p.direction === "SHORT" ? -1 : 1;
  return {
    ...p,
    current_price: ltp,
    current_value: cv,
    unrealized_pnl:
      p.status === "OPEN" ? dirMul * (ltp - p.average_price) * p.quantity : p.unrealized_pnl,
    realized_pnl: p.realized_pnl || p.pnl,
  };
}

/**
 * Fetches the current user's open/closed positions, overlays live LTP on the
 * open ones (Supabase Realtime, no polling), and derives the summary from the
 * live-updated data. `refresh` re-fetches from the DB (e.g. after a close).
 */
export function usePositions(): {
  open: PositionView[];
  closed: PositionView[];
  summary: PositionSummary;
  loading: boolean;
  userId: string | null;
  isLive: boolean;
  refresh: () => Promise<void>;
} {
  const [rawOpen, setRawOpen] = useState<Position[]>([]);
  const [closed, setClosed] = useState<PositionView[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const user = await getCurrentUser();
    if (!user) {
      setRawOpen([]);
      setClosed([]);
      setUserId(null);
      setLoading(false);
      return;
    }
    setUserId(user.id);
    const [open, closedRaw] = await Promise.all([
      getOpenPositions(user.id),
      getClosedPositions(user.id),
    ]);
    setRawOpen(open);
    setClosed(closedRaw.map(toView));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-fetch when the tab regains focus so a trade placed in another tab (or the
  // Trade page before redirecting here) shows up without a manual refresh — the
  // `positions` table isn't on the Realtime feed, only `live_quotes` is.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  // Live LTP for the open symbols; summary + open views recompute reactively.
  const openSymbols = useMemo(
    () => Array.from(new Set(rawOpen.map((p) => p.symbol))),
    [rawOpen]
  );
  const { quotes, isLive: quotesLive } = useLiveQuotes(openSymbols);

  // Option premiums: not on the Realtime feed, so poll the chain (one fetch per
  // distinct symbol+expiry) and overlay them onto option positions for live P&L.
  const [optionPrices, setOptionPrices] = useState<Record<string, number>>({});
  const optionKey = useMemo(
    () =>
      rawOpen
        .filter((p) => p.instrument_type !== "EQ" && p.expiry_date && p.strike_price != null)
        .map((p) => `${p.symbol}|${p.expiry_date}|${p.strike_price}|${p.instrument_type}`)
        .sort()
        .join(";"),
    [rawOpen]
  );
  useEffect(() => {
    const opts = rawOpen.filter((p) => p.instrument_type !== "EQ" && p.expiry_date && p.strike_price != null);
    if (opts.length === 0) {
      setOptionPrices({});
      return;
    }
    let cancelled = false;
    const poll = async () => {
      const groups = new Map<string, { symbol: string; expiry: string }>();
      for (const p of opts) groups.set(`${p.symbol}|${p.expiry_date}`, { symbol: p.symbol, expiry: p.expiry_date! });
      const entries = await Promise.all(
        [...groups.values()].map((g) =>
          getOptionLtpMap(g.symbol, g.expiry).then((m) => [`${g.symbol}|${g.expiry}`, m] as const)
        )
      );
      if (cancelled) return;
      const byGroup = Object.fromEntries(entries);
      const prices: Record<string, number> = {};
      for (const p of opts) {
        const m = byGroup[`${p.symbol}|${p.expiry_date}`];
        const ltp = m?.[`${p.strike_price}:${p.instrument_type === "PE" ? "PE" : "CE"}`];
        if (typeof ltp === "number" && ltp > 0) prices[p.id] = ltp;
      }
      setOptionPrices(prices);
    };
    void poll();
    const id = setInterval(poll, OPTION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the option set, not live ticks
  }, [optionKey]);

  const open = useMemo<PositionView[]>(
    () =>
      rawOpen.map((p) => {
        const v = toView(p);
        const dirMul = p.direction === "SHORT" ? -1 : 1;

        // Options: overlay the polled premium (not on the Realtime feed).
        if (p.instrument_type !== "EQ") {
          const prem = optionPrices[p.id];
          if (prem == null) return v;
          const unreal = dirMul * (prem - p.average_price) * p.quantity;
          return {
            ...v,
            current_price: prem,
            current_value: p.quantity * prem,
            unrealized_pnl: unreal,
            pnl_percent: p.total_invested > 0 ? (unreal / p.total_invested) * 100 : 0,
          };
        }

        // Equities: overlay the Realtime underlying tick.
        const q = quotes[p.symbol];
        if (!q) return v;
        const ltp = q.ltp;
        const unreal = dirMul * (ltp - p.average_price) * p.quantity;
        return {
          ...v,
          current_price: ltp,
          current_value: p.quantity * ltp,
          unrealized_pnl: unreal,
          pnl_percent: p.total_invested > 0 ? (unreal / p.total_invested) * 100 : 0,
          // Day P&L from the tick's day change (per share) × quantity; shorts gain when price falls.
          day_pnl: dirMul * q.change * p.quantity,
        };
      }),
    [rawOpen, quotes, optionPrices]
  );

  const summary = useMemo<PositionSummary>(
    () => summarizePositions(open, closed),
    [open, closed]
  );

  return {
    open,
    closed,
    summary,
    loading,
    userId,
    // Reflect the actual Realtime channel state, not whether prices happen to
    // have arrived (option-only books still get a subscribed channel).
    isLive: quotesLive,
    refresh: load,
  };
}
