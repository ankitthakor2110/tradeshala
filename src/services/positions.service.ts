import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Order, Position, PositionSummary } from "@/types/database";

/**
 * Read layer for the `positions` table (written by trade-engine.service.ts).
 * The table is typed inline via the Position interface rather than in the
 * Database schema, so reads mirror the casting pattern the trade engine uses.
 */

export async function getOpenPositions(userId: string): Promise<Position[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("positions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "OPEN")
      .order("opened_at", { ascending: false })
      .returns<Position[]>();

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function getClosedPositions(userId: string): Promise<Position[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("positions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "CLOSED")
      .order("closed_at", { ascending: false })
      .returns<Position[]>();

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * Recent executed orders (fills) for a symbol, for the position detail drawer.
 * `orders` is typed inline (not in the Database schema), so it's queried via an
 * untyped client view.
 */
export async function getRecentOrders(
  userId: string,
  symbol: string,
  limit = 10
): Promise<Order[]> {
  try {
    const supabase = createClient() as unknown as SupabaseClient;
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("symbol", symbol)
      .eq("status", "EXECUTED")
      .order("executed_at", { ascending: false })
      .limit(limit)
      .returns<Order[]>();
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/** Persists SL / Target / Alert levels on a position (null clears a level). */
export async function setPositionRisk(
  positionId: string,
  fields: { stop_loss?: number | null; target?: number | null; alert_price?: number | null }
): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("positions")
      .update(fields as never)
      .eq("id", positionId);
    return !error;
  } catch {
    return false;
  }
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Unrealized P&L for an open position from its current value vs. invested. */
function unrealized(p: Position): number {
  const current = p.current_value ?? p.quantity * (p.current_price ?? p.average_price);
  return current - p.total_invested;
}

/**
 * Derives the summary from already-fetched positions. Pure, so both the service
 * and the usePositions hook (which overlays live prices) can reuse it and stay
 * consistent.
 */
export function summarizePositions(
  open: Position[],
  closed: Position[]
): PositionSummary {
  const totalInvested = open.reduce((s, p) => s + p.total_invested, 0);
  const currentValue = open.reduce(
    (s, p) => s + (p.current_value ?? p.quantity * (p.current_price ?? p.average_price)),
    0
  );
  const openUnrealizedPnL = currentValue - totalInvested;
  const openUnrealizedPnLPercent =
    totalInvested > 0 ? (openUnrealizedPnL / totalInvested) * 100 : 0;

  const closedToday = closed.filter((p) => isToday(p.closed_at));
  const todayRealizedPnL = closedToday.reduce((s, p) => s + (p.realized_pnl || p.pnl), 0);
  const allRealizedPnL = closed.reduce((s, p) => s + (p.realized_pnl || p.pnl), 0);

  const wins = closed.filter((p) => (p.realized_pnl || p.pnl) > 0).length;
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

  let bestPosition: Position | null = null;
  let worstPosition: Position | null = null;
  for (const p of open) {
    const pnl = unrealized(p);
    if (!bestPosition || pnl > unrealized(bestPosition)) bestPosition = p;
    if (!worstPosition || pnl < unrealized(worstPosition)) worstPosition = p;
  }

  return {
    totalOpenPositions: open.length,
    totalClosedToday: closedToday.length,
    openUnrealizedPnL,
    openUnrealizedPnLPercent,
    todayRealizedPnL,
    todayTotalPnL: todayRealizedPnL + openUnrealizedPnL,
    overallPnL: openUnrealizedPnL + allRealizedPnL,
    overallPnLPercent: totalInvested > 0 ? (openUnrealizedPnL / totalInvested) * 100 : 0,
    totalInvested,
    currentValue,
    winRate,
    bestPosition,
    worstPosition,
  };
}

/**
 * Fetches the user's positions and derives the summary. Used where live prices
 * aren't overlaid (the usePositions hook recomputes from live data instead).
 */
export async function getPositionsSummary(userId: string): Promise<PositionSummary> {
  const [open, closed] = await Promise.all([
    getOpenPositions(userId),
    getClosedPositions(userId),
  ]);
  return summarizePositions(open, closed);
}
