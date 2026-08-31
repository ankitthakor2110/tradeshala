"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getScreener, postFinderAlerts } from "@/services/finder.service";
import { getWatchlist } from "@/services/watchlist.service";
import { createClient } from "@/lib/supabase/client";
import { buildScreenerView } from "@/lib/finder/screener";
import { alertCandidates } from "@/lib/finder/alerts";
import { updateVolumeState, volumeSurges, type VolumeState } from "@/lib/finder/volume";
import { FINDER_CONFIG } from "@/config/finder";
import type {
  ScreenerRow,
  ScreenerSortKey,
  SortDir,
  ScreenerPreset,
} from "@/types/finder";

export interface FinderConfigState {
  preset: ScreenerPreset;
  sortKey: ScreenerSortKey;
  sortDir: SortDir;
  minAbsChangePct: number;
  refreshMs: number;
  alertsEnabled: boolean;
  alertThreshold: number;
}

const STORAGE_KEY = "finder:config:v1";

function loadConfig(): FinderConfigState {
  const fallback: FinderConfigState = {
    preset: FINDER_CONFIG.defaults.preset,
    sortKey: FINDER_CONFIG.defaults.sortKey,
    sortDir: FINDER_CONFIG.defaults.sortDir,
    minAbsChangePct: FINDER_CONFIG.defaults.minAbsChangePct,
    refreshMs: FINDER_CONFIG.defaults.refreshMs,
    alertsEnabled: false,
    alertThreshold: FINDER_CONFIG.alerts.defaultThresholdPct,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

/**
 * Trade Finder brain. Polls the screener route on the chosen cadence (pausing on
 * a hidden tab, single-flight guarded), loads the user's watchlist for the
 * watchlist preset, and runs the pure `buildScreenerView` to produce the ranked,
 * filtered rows. All values are live provider quotes — nothing is fabricated.
 */
export function useScreener() {
  const [config, setConfigState] = useState<FinderConfigState>(loadConfig);
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [source, setSource] = useState<"dhan" | "upstox" | "unavailable">("unavailable");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [surges, setSurges] = useState<Map<string, number>>(new Map());
  const volumeState = useRef<VolumeState>({});
  const inFlight = useRef(false);

  const setConfig = useCallback((patch: Partial<FinderConfigState>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota / private-mode errors */
      }
      return next;
    });
  }, []);

  // Load the user's watchlist once (for the watchlist preset).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const {
          data: { user },
        } = await createClient().auth.getUser();
        if (!user) return;
        const items = await getWatchlist(user.id);
        if (active) setWatchlist(new Set(items.map((i) => i.symbol)));
      } catch {
        /* watchlist stays empty */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await getScreener();
      if (res) {
        setRows(res.rows);
        setSource(res.source);
        setLastUpdated(res.last_updated);
        // Fold this poll's volumes into the session diff and recompute surges.
        const nextVol = updateVolumeState(
          volumeState.current,
          res.rows,
          Date.now(),
          FINDER_CONFIG.volume.maxSamples
        );
        volumeState.current = nextVol;
        setSurges(volumeSurges(nextVol, FINDER_CONFIG.volume.surgeThreshold, FINDER_CONFIG.volume.minSamples));
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  // Poll on cadence; pause on a hidden tab.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void poll();
    };
    tick();
    const id = setInterval(tick, config.refreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [config.refreshMs, poll]);

  const refresh = useCallback(() => void poll(), [poll]);

  // Fire Telegram alerts for movers crossing the threshold whenever fresh rows
  // arrive. The server applies the per-symbol cooldown, so repeated candidates
  // across polls don't spam. No-op unless the user enabled alerts.
  useEffect(() => {
    if (!config.alertsEnabled) return;
    const candidates = alertCandidates(rows, config.alertThreshold);
    if (candidates.length) void postFinderAlerts(candidates);
  }, [rows, config.alertsEnabled, config.alertThreshold]);

  const surgeSet = useMemo(() => new Set(surges.keys()), [surges]);

  const view = useMemo(
    () =>
      buildScreenerView(
        rows,
        { preset: config.preset, minAbsChangePct: config.minAbsChangePct },
        config.sortKey,
        config.sortDir,
        watchlist,
        surgeSet
      ),
    [rows, config.preset, config.minAbsChangePct, config.sortKey, config.sortDir, watchlist, surgeSet]
  );

  return {
    rows,
    view,
    loading,
    source,
    lastUpdated,
    watchlist,
    surges,
    config,
    setConfig,
    refresh,
  };
}
