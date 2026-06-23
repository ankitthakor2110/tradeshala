import type { createAdminClient } from "@/lib/supabase/admin";
import type { TvPosition, TvTrade, TvExitReason } from "@/types/tradingview";
import { TV_WEBHOOK_CONFIG } from "@/config/tradingview";
import type { WebhookPayload, EntryPayload, ExitPayload } from "@/lib/tv/schema";
import {
  computePnl,
  decideEntry,
  inferExitReason,
  reasonTolerance,
  round2,
} from "@/lib/tv/engine";

// ============================================================================
// PAPER-TRADING INTEGRATION BOUNDARY
// ----------------------------------------------------------------------------
// Everything below writes ONLY to the tv_* ledger tables. There is no broker
// client, no order-placement API, and no real money anywhere in this module.
// TradingView signals move rows in Postgres — nothing else. Do not add broker
// calls here.
// ============================================================================

type Admin = ReturnType<typeof createAdminClient>;

export interface ApplyResult {
  handled: "opened" | "closed" | "reversed" | "ignored" | "no-op";
  detail?: string;
  reason?: TvExitReason;
}

// ---------------------------------------------------------------------------
// Webhook logs
// ---------------------------------------------------------------------------

export async function insertLog(
  admin: Admin,
  row: {
    content_type: string | null;
    source_ip: string | null;
    raw_body: string;
    parsed_json: unknown;
    dedupe_key: string | null;
  }
): Promise<string | null> {
  const { data } = await admin
    .from("tv_webhook_logs")
    .insert({ ...row, status: "received" } as never)
    .select("id")
    .single<{ id: string }>();
  return data?.id ?? null;
}

export async function updateLog(
  admin: Admin,
  id: string | null,
  status: "processed" | "rejected",
  error?: string
): Promise<void> {
  if (!id) return;
  await admin
    .from("tv_webhook_logs")
    .update({ status, error: error ?? null } as never)
    .eq("id", id);
}

/** True if a signal with this dedupe key was already processed within the window. */
export async function isDuplicate(admin: Admin, dedupeKey: string): Promise<boolean> {
  const sinceMs = Date.now() - TV_WEBHOOK_CONFIG.dedupeWindowSeconds * 1000;
  const since = new Date(sinceMs).toISOString();
  const { data } = await admin
    .from("tv_webhook_logs")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .eq("status", "processed")
    .gte("received_at", since)
    .limit(1)
    .returns<{ id: string }[]>();
  return (data?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Ledger reads/writes
// ---------------------------------------------------------------------------

async function findOpenPosition(
  admin: Admin,
  strategy: string,
  symbol: string
): Promise<TvPosition | null> {
  const { data } = await admin
    .from("tv_positions")
    .select("*")
    .eq("strategy", strategy)
    .eq("symbol", symbol)
    .eq("status", "open")
    .maybeSingle<TvPosition>();
  return data ?? null;
}

async function openPosition(admin: Admin, p: EntryPayload, openedAt: string): Promise<void> {
  await admin.from("tv_positions").insert({
    strategy: p.strategy,
    symbol: p.symbol,
    side: p.side,
    option_type: p.option_type ?? null,
    timeframe: p.timeframe ?? null,
    entry_price: p.price,
    sl: p.sl ?? null,
    tp: p.tp ?? null,
    qty: p.qty,
    opened_at: openedAt,
    status: "open",
  } as never);
}

/**
 * Close an open position at exitPrice: compute realized P&L, write a tv_trades
 * row, and remove the open-position row (tv_positions holds only open rows).
 */
async function closePosition(
  admin: Admin,
  position: TvPosition,
  exitPrice: number,
  exitAt: string,
  reason: TvExitReason
): Promise<TvTrade | null> {
  const { gross, cost, net } = computePnl({
    side: position.side,
    entry: position.entry_price,
    exit: exitPrice,
    qty: position.qty,
    pointValue: TV_WEBHOOK_CONFIG.pointValue,
    costPerOrder: TV_WEBHOOK_CONFIG.costPerOrder,
  });

  const openedMs = Date.parse(position.opened_at);
  const closedMs = Date.parse(exitAt);
  const duration =
    Number.isFinite(openedMs) && Number.isFinite(closedMs)
      ? round2(Math.max(0, (closedMs - openedMs) / 1000))
      : null;

  const { data: trade } = await admin
    .from("tv_trades")
    .insert({
      strategy: position.strategy,
      symbol: position.symbol,
      side: position.side,
      option_type: position.option_type,
      entry_price: position.entry_price,
      exit_price: exitPrice,
      qty: position.qty,
      gross,
      cost,
      net,
      reason,
      opened_at: position.opened_at,
      closed_at: exitAt,
      duration_seconds: duration,
    } as never)
    .select("*")
    .single<TvTrade>();

  // Remove the open-position row by its unique id.
  await admin.from("tv_positions").delete().eq("id", position.id);
  return trade ?? null;
}

// ---------------------------------------------------------------------------
// Signal application
// ---------------------------------------------------------------------------

async function applyEntry(admin: Admin, p: EntryPayload): Promise<ApplyResult> {
  const existing = await findOpenPosition(admin, p.strategy, p.symbol);
  const decision = decideEntry(existing?.side ?? null, p.side, TV_WEBHOOK_CONFIG.allowReverse);
  const openedAt = p.time ?? new Date().toISOString();

  if (decision.action === "ignore") {
    return { handled: "ignored", detail: decision.reason };
  }

  if (decision.action === "reverse_then_open" && existing) {
    // Close the opposite position at this entry's price, reason "reverse".
    await closePosition(admin, existing, p.price, openedAt, "reverse");
    await openPosition(admin, p, openedAt);
    return { handled: "reversed", detail: `closed ${existing.side} then opened ${p.side}` };
  }

  await openPosition(admin, p, openedAt);
  return { handled: "opened", detail: `${p.side} ${p.symbol} @ ${p.price}` };
}

async function applyExit(admin: Admin, p: ExitPayload): Promise<ApplyResult> {
  const existing = await findOpenPosition(admin, p.strategy, p.symbol);
  if (!existing) {
    return { handled: "no-op", detail: "no open position for (strategy, symbol) to close" };
  }
  const tol = reasonTolerance(
    p.price,
    TV_WEBHOOK_CONFIG.reasonTolerancePercent,
    TV_WEBHOOK_CONFIG.reasonToleranceMin
  );
  const reason = inferExitReason(p.price, existing.sl, existing.tp, tol);
  const exitAt = p.time ?? new Date().toISOString();
  await closePosition(admin, existing, p.price, exitAt, reason);
  return { handled: "closed", reason, detail: `closed ${existing.side} @ ${p.price} (${reason})` };
}

export async function applySignal(admin: Admin, payload: WebhookPayload): Promise<ApplyResult> {
  return payload.event === "entry" ? applyEntry(admin, payload) : applyExit(admin, payload);
}
