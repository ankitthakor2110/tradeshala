"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getEngineTrades } from "@/services/tradingview.service";
import { TV_DASHBOARD_COPY } from "@/config/tradingview";
import type { EngineOpenPosition, EngineTrade } from "@/types/tradingview";

// Reads the REAL automated option paper-trades the webhook engine placed into
// the simulator (positions/orders), for the descriptive "Automated Trades"
// section on the Signals page. RLS-scoped to the signed-in user, so it only
// returns rows when that user IS the configured trade account. Polls on the same
// cadence as the ledger; pauses while the tab is hidden.

export interface EngineTradesState {
  open: EngineOpenPosition[];
  closed: EngineTrade[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useEngineTrades(): EngineTradesState {
  const [open, setOpen] = useState<EngineOpenPosition[]>([]);
  const [closed, setClosed] = useState<EngineTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      let uid = userIdRef.current;
      if (!uid) {
        const { data } = await createClient().auth.getUser();
        uid = data.user?.id ?? null;
        userIdRef.current = uid;
      }
      if (!uid) {
        setOpen([]);
        setClosed([]);
        return;
      }
      const { open: o, closed: c } = await getEngineTrades(uid);
      setOpen(o);
      setClosed(c);
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

  return { open, closed, loading, refresh };
}
