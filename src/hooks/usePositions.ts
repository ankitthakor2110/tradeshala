"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUser } from "@/services/auth.service";
import {
  getOpenPositions,
  getClosedPositions,
  summarizePositions,
} from "@/services/positions.service";
import { useLiveQuotes } from "./useLiveQuotes";
import type { Position, PositionSummary } from "@/types/database";

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
  return {
    ...p,
    current_price: ltp,
    current_value: cv,
    unrealized_pnl: p.status === "OPEN" ? cv - p.total_invested : p.unrealized_pnl,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount
    load();
  }, [load]);

  // Live LTP for the open symbols; summary + open views recompute reactively.
  const openSymbols = useMemo(
    () => Array.from(new Set(rawOpen.map((p) => p.symbol))),
    [rawOpen]
  );
  const { quotes } = useLiveQuotes(openSymbols);

  const open = useMemo<PositionView[]>(
    () =>
      rawOpen.map((p) => {
        const v = toView(p);
        const q = quotes[p.symbol];
        if (!q) return v;
        const ltp = q.ltp;
        const cv = p.quantity * ltp;
        const unreal = cv - p.total_invested;
        return {
          ...v,
          current_price: ltp,
          current_value: cv,
          unrealized_pnl: unreal,
          pnl_percent: p.total_invested > 0 ? (unreal / p.total_invested) * 100 : 0,
          // Day P&L from the tick's day change (per share) × quantity.
          day_pnl: q.change * p.quantity,
        };
      }),
    [rawOpen, quotes]
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
    isLive: Object.keys(quotes).length > 0,
    refresh: load,
  };
}
