"use client";

import { useState, useEffect } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";
import { getCurrentUser } from "@/services/auth.service";
import { canReconnectUpstox } from "@/config/admin";

/**
 * Surfaces the shared Upstox session state on the dashboard.
 *
 * Live data is powered by ONE shared Upstox login. When that session is missing
 * or expired:
 *   - the managing user (UPSTOX_RECONNECT_EMAIL) sees a one-click "Reconnect
 *     Upstox" button (hits /api/broker/reconnect → Upstox login → stores the
 *     fresh shared token), and
 *   - everyone else sees a quiet "waiting for authorization" note (it clears
 *     itself once the managing user reconnects).
 *
 * Status comes from the cheap /api/broker/upstox/status endpoint (DB-only, no
 * live Upstox call), polled so the banner clears automatically after reconnect.
 */
export default function UpstoxReconnectBanner() {
  const mounted = useIsMounted();
  const [manages, setManages] = useState(false);
  // Assume connected until we know otherwise, so there's no banner flash on load.
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchConnected(): Promise<boolean> {
      try {
        const res = await fetch("/api/broker/upstox/status");
        if (!res.ok) return true; // don't nag on auth/transient errors
        const s = await res.json();
        return !!s.connected;
      } catch {
        return true;
      }
    }

    (async () => {
      const user = await getCurrentUser();
      if (!active) return;
      setManages(canReconnectUpstox(user?.email));
      setConnected(await fetchConnected());
    })();

    // Re-check periodically so the banner clears itself after a reconnect.
    const interval = setInterval(async () => {
      const c = await fetchConnected();
      if (active) setConnected(c);
    }, 60000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (!mounted || connected) return null;

  // Managing user — actionable reconnect.
  if (manages) {
    return (
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <p className="text-sm text-amber-200">
            Live market data is paused — today&apos;s Upstox session needs authorizing.
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

  // Everyone else — passive, self-clearing note.
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <span className="h-2 w-2 rounded-full bg-amber-400/70" />
      <p className="text-sm text-amber-200/80">
        Live market data is paused — waiting for today&apos;s broker authorization. It&apos;ll resume automatically.
      </p>
    </div>
  );
}
