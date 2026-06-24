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

export interface RecentContract {
  symbol: string;
  exchange: string;
  instrument_type: "EQ" | "CE" | "PE" | "FUT";
  option_type: "CE" | "PE" | null;
  strike_price: number | null;
  expiry_date: string | null;
  company_name: string | null;
  executed_at: string | null;
}

/**
 * Most recently executed *contracts* (deduped) across all symbols, for the
 * "recent trades" quick re-entry strip on the trade page. Distinct on the
 * contract key (symbol + strike + expiry + side), newest first.
 */
export async function getRecentContracts(
  userId: string,
  limit = 6
): Promise<RecentContract[]> {
  try {
    const supabase = createClient() as unknown as SupabaseClient;
    const { data, error } = await supabase
      .from("orders")
      .select(
        "symbol, exchange, instrument_type, option_type, strike_price, expiry_date, company_name, executed_at"
      )
      .eq("user_id", userId)
      .eq("status", "EXECUTED")
      .order("executed_at", { ascending: false })
      .limit(60)
      .returns<RecentContract[]>();
    if (error || !data) return [];

    const seen = new Set<string>();
    const out: RecentContract[] = [];
    for (const o of data) {
      const key = `${o.symbol}|${o.instrument_type}|${o.strike_price ?? ""}|${o.expiry_date ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(o);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Persists SL / Target / Alert levels on a position (null clears a level). */
export async function setPositionRisk(
  positionId: string,
  fields: {
    stop_loss?: number | null;
    target?: number | null;
    alert_price?: number | null;
    trail_amount?: number | null;
  }
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

/** Persists journal notes + tags on a position (trade journal page). */
export async function setPositionJournal(
  positionId: string,
  fields: { notes?: string | null; tags?: string[] | null }
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

/** Persists scale-out target levels on a position. */
export async function setPositionTargets(
  positionId: string,
  targets: { price: number; qty: number }[]
): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("positions")
      .update({ targets } as never)
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

/** Unrealized P&L for an open position — long gains as price rises, short as it falls. */
function unrealized(p: Position): number {
  const ltp = p.current_price ?? p.average_price;
  const perUnit = p.direction === "SHORT" ? p.average_price - ltp : ltp - p.average_price;
  return perUnit * p.quantity;
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
  // Sum per-position P&L (direction-aware) rather than currentValue - invested,
  // which only holds for longs.
  const openUnrealizedPnL = open.reduce((s, p) => s + unrealized(p), 0);
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
