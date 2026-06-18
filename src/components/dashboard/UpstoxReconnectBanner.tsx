"use client";

import { useState, useEffect } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";
import { getCurrentUser } from "@/services/auth.service";
import { canReconnectUpstox } from "@/config/admin";

/**
 * Shows a "live data stale — reconnect Upstox" banner with a one-click reconnect
 * button, but ONLY for the single user who manages the Upstox connection
 * (UPSTOX_RECONNECT_EMAIL). The button hits /api/broker/reconnect, which sends
 * the user straight to the Upstox login and stores the fresh token.
 */
export default function UpstoxReconnectBanner() {
  const mounted = useIsMounted();
  const [allowed, setAllowed] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkStale() {
      try {
        const res = await fetch("/api/market-data/health");
        const h = await res.json();
        return h?.upstox?.status === "error" || h?.upstox?.tokenExpired === true;
      } catch {
        return false;
      }
    }

    (async () => {
      const user = await getCurrentUser();
      if (!active || !canReconnectUpstox(user?.email)) return;
      setAllowed(true);
      setStale(await checkStale());
    })();

    // Re-check periodically so the banner clears itself after a reconnect.
    const interval = setInterval(async () => {
      if (!allowed) return;
      const s = await checkStale();
      if (active) setStale(s);
    }, 60000);

    return () => {
      active = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!mounted || !allowed || !stale) return null;

  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <p className="text-sm text-amber-200">
          Live market data is stale — your Upstox session has expired.
        </p>
      </div>
      <a
        href="/api/broker/reconnect"
        className="shrink-0 text-center text-xs font-semibold px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 cursor-pointer transition-all duration-200 active:scale-95"
      >
        Reconnect Upstox
      </a>
    </div>
  );
}
