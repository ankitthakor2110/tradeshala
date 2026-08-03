import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Position } from "@/types/database";
import type {
  TvPosition,
  TvTrade,
  EngineExitReason,
  EngineOpenPosition,
  EngineTrade,
} from "@/types/tradingview";

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

// ---------------------------------------------------------------------------
// Engine trades — the REAL option paper-trades the webhook engine placed into
// the simulator, distinct from the tv_* signal ledger above.
//
// The `positions` table carries no strategy tag, so we can't filter engine vs
// manual there. Instead we use `orders`, which DOES: a webhook OPEN writes a BUY
// order with strategy_name set (manual buys leave it null), and a close writes a
// SELL whose notes say why ("Auto: target|stop-loss|..." from GTT, or
// "TradingView exit: ..."). We take positions as the accurate data spine (entry,
// exit, P&L, target/stop, times) and match each to its orders by contract key +
// timestamp — the open order and its position share the same write instant, so
// a position is "engine" iff a strategy-tagged BUY sits at its opened_at.
//
// Reads use the browser client (RLS-scoped), so these only surface when signed
// in as the configured trade account.
// ---------------------------------------------------------------------------

/** Map a closing SELL order's notes to a normalized exit reason. Pure. */
export function normalizeEngineExitReason(notes: string | null): EngineExitReason {
  const n = (notes ?? "").toLowerCase();
  if (n.includes("target")) return "target";
  if (n.includes("stop-loss") || n.includes("stop loss")) return "stop";
  if (n.includes("trailing")) return "trail";
  if (n.includes("square-off") || n.includes("square off")) return "squareoff";
  if (n.includes("scale-out") || n.includes("scale out")) return "scaleout";
  if (n.includes("tradingview exit")) return "signal";
  return "manual";
}

const optType = (t: string | null): "CE" | "PE" => (t === "PE" ? "PE" : "CE");
const contractKey = (symbol: string, strike: number | null, ot: string | null, expiry: string | null) =>
  `${symbol}|${strike ?? ""}|${optType(ot)}|${expiry ?? ""}`;

interface OrderLite {
  symbol: string;
  strike_price: number | null;
  option_type: string | null;
  expiry_date: string | null;
  executed_at: string | null;
  trade_type: "BUY" | "SELL";
  strategy_name: string | null;
  notes: string | null;
}

export interface EngineTradesResult {
  open: EngineOpenPosition[];
  closed: EngineTrade[];
}

/** Nearest entry to targetMs, within tolMs (Infinity = no limit). */
function nearestBy<T extends { ms: number }>(arr: T[] | undefined, targetMs: number, tolMs = Infinity): T | null {
  if (!arr || !Number.isFinite(targetMs)) return null;
  let best: T | null = null;
  let bestD = Infinity;
  for (const c of arr) {
    const d = Math.abs(c.ms - targetMs);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best && bestD <= tolMs ? best : null;
}

/**
 * Engine option paper-trades for the trade account, split into open (running)
 * and closed (with exit reason). Empty for a non-trade account (RLS) or when the
 * engine has never executed.
 */
export async function getEngineTrades(userId: string, limit = 300): Promise<EngineTradesResult> {
  const supabase = createClient();
  const { data: positions } = await supabase
    .from("positions")
    .select("*")
    .eq("user_id", userId)
    .in("instrument_type", ["CE", "PE"])
    .order("opened_at", { ascending: false })
    .limit(limit)
    .returns<Position[]>();
  const posList = positions ?? [];
  if (posList.length === 0) return { open: [], closed: [] };

  // `orders` is typed inline (not in the Database schema) → query via an untyped view.
  const orders = createClient() as unknown as SupabaseClient;
  const { data: ords } = await orders
    .from("orders")
    .select("symbol, strike_price, option_type, expiry_date, executed_at, trade_type, strategy_name, notes")
    .eq("user_id", userId)
    .eq("status", "EXECUTED")
    .in("instrument_type", ["CE", "PE"])
    .order("executed_at", { ascending: false })
    .limit(1000)
    .returns<OrderLite[]>();

  // Index strategy-tagged BUYs (engine entries) and all SELLs (closes) by contract.
  const engineBuys = new Map<string, { ms: number; strategy: string }[]>();
  const sells = new Map<string, { ms: number; notes: string | null }[]>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  for (const o of ords ?? []) {
    if (!o.executed_at) continue;
    const k = contractKey(o.symbol, o.strike_price, o.option_type, o.expiry_date);
    const ms = Date.parse(o.executed_at);
    if (o.trade_type === "BUY" && o.strategy_name) push(engineBuys, k, { ms, strategy: o.strategy_name });
    else if (o.trade_type === "SELL") push(sells, k, { ms, notes: o.notes });
  }

  const open: EngineOpenPosition[] = [];
  const closed: EngineTrade[] = [];
  for (const p of posList) {
    const k = contractKey(p.symbol, p.strike_price, p.option_type, p.expiry_date);
    // Engine iff a strategy-tagged BUY sits at this position's open instant.
    const buy = nearestBy(engineBuys.get(k), Date.parse(p.opened_at), 3000);
    if (!buy) continue;

    if (p.status === "OPEN") {
      open.push({
        id: p.id,
        strategy: buy.strategy,
        symbol: p.symbol,
        optionType: optType(p.option_type),
        strike: p.strike_price,
        expiry: p.expiry_date,
        qty: p.quantity,
        lotSize: p.lot_size,
        entryPrice: p.average_price,
        currentPrice: p.current_price,
        stopLoss: p.stop_loss,
        target: p.target,
        openedAt: p.opened_at,
      });
    } else {
      const sell = nearestBy(sells.get(k), p.closed_at ? Date.parse(p.closed_at) : NaN);
      closed.push({
        id: p.id,
        strategy: buy.strategy,
        symbol: p.symbol,
        optionType: optType(p.option_type),
        strike: p.strike_price,
        expiry: p.expiry_date,
        qty: p.quantity,
        lotSize: p.lot_size,
        entryPrice: p.average_price,
        exitPrice: p.current_price ?? p.average_price,
        net: p.realized_pnl,
        pnlPercent: p.pnl_percent,
        openedAt: p.opened_at,
        closedAt: p.closed_at,
        exitReason: normalizeEngineExitReason(sell?.notes ?? null),
      });
    }
  }

  closed.sort((a, b) => (b.closedAt ? Date.parse(b.closedAt) : 0) - (a.closedAt ? Date.parse(a.closedAt) : 0));
  return { open, closed };
}
