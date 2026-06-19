"use client";

import { useEffect, useRef } from "react";
import { triggerSnapshotRefresh } from "@/services/market-data.service";
import { getMarketStatus } from "@/services/dashboard.service";
import { dashboardConfig } from "@/config/dashboard";

/**
 * Drives intra-day market snapshots from the browser. Vercel Cron keeps the
 * `live_quotes` table fresh on Pro, but the Hobby plan caps cron at once per
 * day — so while a live-data page is mounted, this asks the server to take a
 * fresh snapshot on an interval. The server write then fans out to every
 * client via Supabase Realtime (see `useLiveQuotes`), so one poller refreshes
 * prices for all open tabs.
 *
 * Polling pauses when the tab is hidden or the market is closed, and the server
 * throttles concurrent triggers so multiple open tabs don't multiply provider
 * calls.
 *
 * @param enabled set false to suspend polling (e.g. while a page is loading)
 */
export function useSnapshotPoller(enabled: boolean = true): void {
  const intervalMs = dashboardConfig.marketData.snapshotPollIntervalMs;
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled || inFlight.current) return;
      // Don't poll a hidden tab or a closed market — nothing to refresh.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (!getMarketStatus()) return;

      inFlight.current = true;
      try {
        await triggerSnapshotRefresh();
      } finally {
        inFlight.current = false;
      }
    };

    void tick(); // refresh immediately on mount
    const id = setInterval(tick, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
