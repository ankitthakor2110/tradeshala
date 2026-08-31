"use client";

import { useEffect, useMemo, useState } from "react";
import { getEconomicCalendar, getNearestExpiry } from "@/services/finder.service";
import { buildEventList, computeEventRisk, type RawEvent } from "@/lib/intel/events";
import { INTEL_CONFIG } from "@/config/intel";
import type { EventRisk } from "@/types/intel";

const CFG = INTEL_CONFIG.events;
const CALENDAR_REFRESH_MS = 30 * 60 * 1000; // FMP events change slowly
const GATE_RECOMPUTE_MS = 30 * 1000; // re-resolve the gate every 30s

/** Resolve the maintained calendar + live weekly expiry into the gate for `now`. */
function resolve(macro: ReadonlyArray<RawEvent>, expiry: string | null, nowMs: number): EventRisk {
  const events = buildEventList(macro, expiry, CFG.expiry);
  return computeEventRisk(
    events,
    nowMs,
    CFG.windows,
    CFG.coverageThrough,
    CFG.labels.clear,
    CFG.labels.empty
  );
}

/**
 * Trade Finder event-risk hook. Auto-fetches the FMP macro calendar and the
 * nearest NIFTY expiry, merges them via the shared event engine, and re-resolves
 * the gate on a coarse tick. The panel runs its own 1-second countdown for
 * display, so this cadence only needs to keep the gate (dimming) fresh.
 *
 * Returns `null` until the first resolution; an empty/failed FMP fetch still
 * yields expiry-only risk (honest NO-FEED when even that is missing).
 */
export function useEventRisk(): EventRisk | null {
  const [macro, setMacro] = useState<ReadonlyArray<RawEvent>>([]);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Fetch the calendar + expiry on mount and on the slow refresh cadence.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [cal, exp] = await Promise.all([
        getEconomicCalendar(),
        getNearestExpiry("NIFTY"),
      ]);
      if (!active) return;
      setMacro(cal.events);
      setExpiry(exp);
    };
    void load();
    const id = setInterval(() => void load(), CALENDAR_REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Advance the clock on a coarse tick so the derived gate stays fresh (the panel
  // runs its own 1s countdown for display; this only keeps the dimming gate current).
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), GATE_RECOMPUTE_MS);
    return () => clearInterval(id);
  }, []);

  // Derived — no setState-in-effect. Recomputes when inputs or the clock change.
  return useMemo(() => resolve(macro, expiry, nowMs), [macro, expiry, nowMs]);
}
