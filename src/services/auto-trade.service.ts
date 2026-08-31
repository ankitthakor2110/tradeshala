import { createClient } from "@/lib/supabase/client";
import type { AutoTradeConfig, Decision, RiskCounters } from "@/types/autoTrade";

// ============================================================================
// Client-side readers/writers for the Automatic Trade Taker. Config + status +
// test + emergency go through the /api/trading/* routes (server validates and
// versions). Decision-row reads go direct through the browser client (own-row
// RLS), mirroring how tradingview.service.ts reads the tv_* ledger.
// ============================================================================

export interface ConfigResponse {
  config: AutoTradeConfig;
  version: number;
  emergencyStopped: boolean;
  exists: boolean;
  updatedAt: string | null;
}

export interface AutomationStatus {
  configured: boolean;
  enabled: boolean;
  mode: string;
  dryRun: boolean;
  emergencyStopped: boolean;
  marketOpen: boolean;
  counters: RiskCounters;
  limits: AutoTradeConfig["riskLimits"] | null;
  dailyLossRemaining: number | null;
}

export interface AutoTradeDecisionRow {
  id: string;
  status: string;
  reason: string | null;
  mode: string | null;
  symbol: string | null;
  direction: string | null;
  option_type: string | null;
  side: string | null;
  strategy: string | null;
  timeframe: string | null;
  signal_price: number | null;
  signal_time: string | null;
  strike: number | null;
  expiry: string | null;
  delta: number | null;
  entry_price: number | null;
  quantity: number | null;
  lot_size: number | null;
  target: number | null;
  stop_loss: number | null;
  target_type: string | null;
  stop_loss_type: string | null;
  open_action: string | null;
  config_version: number | null;
  audit_trail: { step: string; ok: boolean; detail: string }[] | null;
  normalized_signal: unknown;
  raw_payload: unknown;
  order_id: string | null;
  position_id: string | null;
  realized_pnl: number | null;
  is_auto: boolean;
  dry_run: boolean;
  created_at: string;
}

async function jsonOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function getTradingConfig(): Promise<ConfigResponse> {
  return jsonOrThrow(await fetch("/api/trading/config", { cache: "no-store" }));
}

export async function saveTradingConfig(
  config: AutoTradeConfig
): Promise<{ ok: true; version: number } | { ok: false; errors: string[]; error: string }> {
  const res = await fetch("/api/trading/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, errors: data.errors ?? [], error: data.error ?? "Save failed" };
  return { ok: true, version: data.version };
}

export async function getAutomationStatus(): Promise<AutomationStatus> {
  return jsonOrThrow(await fetch("/api/trading/status", { cache: "no-store" }));
}

export async function setEmergencyStop(stopped: boolean): Promise<{ ok: boolean; emergencyStopped: boolean }> {
  return jsonOrThrow(
    await fetch("/api/trading/auto", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stopped }),
    })
  );
}

export interface TestSignalInput {
  symbol: string;
  direction: "BUY" | "SELL";
  optionType?: "CE" | "PE" | "";
  price?: number;
  strategy?: string;
  execute?: boolean;
}

export async function submitTestSignal(
  input: TestSignalInput
): Promise<{ ok: boolean; decision: Decision; expiry: string | null; executed: boolean }> {
  return jsonOrThrow(
    await fetch("/api/trading/test-signal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function decideProposed(
  id: string,
  action: "approve" | "reject"
): Promise<{ ok: boolean; status?: string; detail?: string; reason?: string }> {
  return jsonOrThrow(
    await fetch("/api/trading/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action }),
    })
  );
}

/** Read the current user's recent auto-trade decisions (own-row RLS). */
export async function getDecisions(limit = 100): Promise<AutoTradeDecisionRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("auto_trade_decisions")
    .select("*")
    .neq("status", "PROCESSING")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<AutoTradeDecisionRow[]>();
  return data ?? [];
}
