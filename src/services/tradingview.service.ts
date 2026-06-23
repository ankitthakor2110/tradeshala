import { createClient } from "@/lib/supabase/client";
import type { TvPosition, TvTrade } from "@/types/tradingview";

// Client-side readers for the TradingView paper-trading ledger. The tv_* tables
// are readable by any authenticated user (RLS select policy), so the browser
// client queries them directly — no API route needed for reads. Writes happen
// only via the webhook (service role) and the admin-gated reset route.

export async function getTvOpenPositions(): Promise<TvPosition[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tv_positions")
    .select("*")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .returns<TvPosition[]>();
  return data ?? [];
}

export async function getTvClosedTrades(limit = 500): Promise<TvTrade[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tv_trades")
    .select("*")
    .order("closed_at", { ascending: false })
    .limit(limit)
    .returns<TvTrade[]>();
  return data ?? [];
}

export interface TvResetResult {
  ok: boolean;
  message: string;
}

/** Clear the paper account (positions + trades; webhook logs are kept). */
export async function resetTvLedger(): Promise<TvResetResult> {
  try {
    const res = await fetch("/api/tv/reset", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: body?.error ?? `Reset failed (HTTP ${res.status})` };
    }
    return { ok: true, message: "Paper account reset." };
  } catch (e) {
    return { ok: false, message: (e as Error).message ?? "Reset failed" };
  }
}
