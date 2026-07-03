import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOptionChain } from "@/lib/market-data/option-chain";
import { TRADE_CONFIG } from "@/config/trade";
import {
  simulateFill,
  computeShortMargin,
  findOpenPosition,
} from "@/services/trade-engine.service";
import type { Order, OrderFormData, SimulatedFill } from "@/types/database";

// ============================================================================
// Server-side pending-order fill engine
// ----------------------------------------------------------------------------
// Runs inside the snapshot flow (the cron loop / per client-poll), alongside
// runGttOnce. For every PENDING LIMIT / SL / SL-M *entry* order it fetches the
// live price, re-evaluates the fill condition (reusing the pure simulateFill),
// re-checks affordability at the fill price, and — if it fills — opens/updates
// the position and moves virtual cash server-side. So orders execute even when
// no browser tab is open. Mirrors the client path in trade-engine's placeOrder
// (validate → fill → updatePosition → cash) but with the service-role client,
// exactly as gtt.ts mirrors the close side.
// ============================================================================

type Admin = ReturnType<typeof createAdminClient>;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Reshape an order row into the OrderFormData shape simulateFill expects.
function toFormData(order: Order): OrderFormData {
  return {
    symbol: order.symbol,
    exchange: order.exchange,
    instrument_type: order.instrument_type as OrderFormData["instrument_type"],
    option_type: order.option_type,
    strike_price: order.strike_price,
    expiry_date: order.expiry_date,
    lot_size: order.lot_size,
    order_type: order.order_type,
    trade_type: order.trade_type,
    quantity: order.quantity,
    price: order.price,
    trigger_price: order.trigger_price,
    notes: order.notes,
  };
}

/**
 * Affordability re-check at fill time, against the ACTUAL fill price (a pending
 * BUY may no longer be affordable when it finally triggers). Mirrors the
 * BUY/SELL/short-margin branches of validateOrder but on the admin client.
 * Returns true if the fill can proceed.
 */
async function canAfford(admin: Admin, order: Order, fillPrice: number): Promise<boolean> {
  if (fillPrice <= 0) return false;
  const brokerage = TRADE_CONFIG.simulation.brokeragePerOrder;

  const { data: profile } = await admin
    .from("profiles")
    .select("virtual_balance")
    .eq("id", order.user_id)
    .single<{ virtual_balance: number }>();
  const balance = profile?.virtual_balance ?? 0;

  const existing = await findOpenPosition(admin, order.user_id, order);

  if (order.trade_type === "BUY") {
    if (existing && existing.direction === "SHORT") {
      // Buy-to-close a short: buyback cost net of released margin.
      const closeQty = Math.min(order.quantity, existing.quantity);
      const marginReleased =
        existing.quantity > 0 ? existing.margin_blocked * (closeQty / existing.quantity) : 0;
      const buyback = order.quantity * fillPrice + brokerage;
      return buyback <= balance + marginReleased;
    }
    // Buy-to-open / add long: pay premium + brokerage from cash.
    const estimatedCost = order.quantity * fillPrice + brokerage;
    return estimatedCost <= balance;
  }

  // SELL
  if (existing && existing.direction === "LONG") {
    // Sell-to-close a long: no flipping in a single order.
    return existing.quantity >= order.quantity;
  }
  // Sell-to-open / add short: block margin (net of premium received).
  const margin = await computeShortMargin(
    admin,
    order.user_id,
    {
      symbol: order.symbol,
      instrument_type: order.instrument_type,
      option_type: order.option_type,
      strike_price: order.strike_price,
      expiry_date: order.expiry_date,
      quantity: order.quantity,
    },
    fillPrice
  );
  const premium = order.quantity * fillPrice;
  const required = Math.max(0, margin - premium) + brokerage;
  return required <= balance;
}

/**
 * Open/add/close the position for a filled entry order and return the signed
 * cash delta (+ credits the user, - debits). THROWS on any positions-write
 * failure so the caller can void the order and skip the cash move (the
 * silent-loss guard). Reimplements updatePosition's five branches with the
 * admin client; attaches the order's carried SL/target to any NEW position.
 */
async function openFromFill(admin: Admin, order: Order, fill: SimulatedFill): Promise<number> {
  const now = new Date().toISOString();
  const price = fill.executed_price;
  const charges = fill.total_charges;
  const userId = order.user_id;

  const write = async (op: PromiseLike<{ error: { message?: string } | null }>) => {
    const { error } = await op;
    if (error) throw new Error(error.message ?? "positions write failed");
  };
  const marginForOrder = () =>
    computeShortMargin(
      admin,
      userId,
      {
        symbol: order.symbol,
        instrument_type: order.instrument_type,
        option_type: order.option_type,
        strike_price: order.strike_price,
        expiry_date: order.expiry_date,
        quantity: order.quantity,
      },
      price
    );

  const existing = await findOpenPosition(admin, userId, order);

  // --- Close / reduce a SHORT (buy-to-close) ---
  if (existing && existing.direction === "SHORT" && order.trade_type === "BUY") {
    const closeQty = Math.min(order.quantity, existing.quantity);
    const marginReleased =
      existing.quantity > 0 ? round2(existing.margin_blocked * (closeQty / existing.quantity)) : 0;
    const realized = round2((existing.average_price - price) * closeQty);
    const cashDelta = round2(marginReleased - price * closeQty - charges);
    const remaining = existing.quantity - closeQty;

    if (remaining <= 0) {
      await write(admin.from("positions").update({
        quantity: 0,
        margin_blocked: 0,
        realized_pnl: round2((existing.realized_pnl ?? 0) + realized),
        pnl: realized,
        pnl_percent: existing.total_invested > 0 ? round2((realized / existing.total_invested) * 100) : 0,
        current_price: price,
        status: "CLOSED",
        closed_at: now,
        updated_at: now,
      } as never).eq("id", existing.id));
    } else {
      await write(admin.from("positions").update({
        quantity: remaining,
        margin_blocked: round2(existing.margin_blocked - marginReleased),
        total_invested: round2(remaining * existing.average_price),
        realized_pnl: round2((existing.realized_pnl ?? 0) + realized),
        current_price: price,
        current_value: round2(remaining * price),
        updated_at: now,
      } as never).eq("id", existing.id));
    }
    return cashDelta;
  }

  // --- Add to a SHORT (sell-to-open more) ---
  if (existing && existing.direction === "SHORT" && order.trade_type === "SELL") {
    const newQty = existing.quantity + order.quantity;
    const newAvg = round2(
      (existing.quantity * existing.average_price + order.quantity * price) / newQty
    );
    const addMargin = await marginForOrder();
    const cashDelta = round2(price * order.quantity - charges - addMargin);
    await write(admin.from("positions").update({
      quantity: newQty,
      average_price: newAvg,
      total_invested: round2(newQty * newAvg),
      margin_blocked: round2(existing.margin_blocked + addMargin),
      current_price: price,
      current_value: round2(newQty * price),
      updated_at: now,
    } as never).eq("id", existing.id));
    return cashDelta;
  }

  // --- Open a new SHORT (sell-to-open, no existing position) ---
  if (!existing && order.trade_type === "SELL") {
    const margin = await marginForOrder();
    const invested = round2(order.quantity * price);
    const cashDelta = round2(price * order.quantity - charges - margin);
    await write(admin.from("positions").insert({
      user_id: userId,
      symbol: order.symbol,
      exchange: order.exchange,
      instrument_type: order.instrument_type,
      company_name: order.company_name,
      option_type: order.option_type,
      strike_price: order.strike_price,
      expiry_date: order.expiry_date,
      lot_size: order.lot_size,
      direction: "SHORT",
      quantity: order.quantity,
      average_price: price,
      total_invested: invested,
      margin_blocked: margin,
      current_price: price,
      current_value: invested,
      pnl: 0,
      pnl_percent: 0,
      day_pnl: 0,
      status: "OPEN",
      stop_loss: order.attached_stop_loss ?? null,
      target: order.attached_target ?? null,
      opened_at: now,
      updated_at: now,
    } as never));
    return cashDelta;
  }

  // --- LONG: add / open (buy) ---
  if (order.trade_type === "BUY") {
    if (existing) {
      const newQty = existing.quantity + order.quantity;
      const newAvg = round2(
        (existing.quantity * existing.average_price + order.quantity * price) / newQty
      );
      await write(admin.from("positions").update({
        quantity: newQty,
        average_price: newAvg,
        total_invested: round2(newQty * newAvg),
        current_price: price,
        current_value: round2(newQty * price),
        updated_at: now,
      } as never).eq("id", existing.id));
    } else {
      const invested = round2(order.quantity * price);
      await write(admin.from("positions").insert({
        user_id: userId,
        symbol: order.symbol,
        exchange: order.exchange,
        instrument_type: order.instrument_type,
        company_name: order.company_name,
        option_type: order.option_type,
        strike_price: order.strike_price,
        expiry_date: order.expiry_date,
        lot_size: order.lot_size,
        direction: "LONG",
        quantity: order.quantity,
        average_price: price,
        total_invested: invested,
        margin_blocked: 0,
        current_price: price,
        current_value: invested,
        pnl: 0,
        pnl_percent: 0,
        day_pnl: 0,
        status: "OPEN",
        stop_loss: order.attached_stop_loss ?? null,
        target: order.attached_target ?? null,
        opened_at: now,
        updated_at: now,
      } as never));
    }
    return round2(-(price * order.quantity + charges));
  }

  // --- LONG: close / reduce (sell) ---
  if (order.trade_type === "SELL" && existing) {
    const newQty = existing.quantity - order.quantity;
    if (newQty <= 0) {
      const realized = round2((price - existing.average_price) * order.quantity);
      await write(admin.from("positions").update({
        quantity: 0,
        realized_pnl: round2((existing.realized_pnl ?? 0) + realized),
        pnl: realized,
        pnl_percent: existing.total_invested > 0 ? round2((realized / existing.total_invested) * 100) : 0,
        current_price: price,
        status: "CLOSED",
        closed_at: now,
        updated_at: now,
      } as never).eq("id", existing.id));
    } else {
      const realized = round2((price - existing.average_price) * order.quantity);
      await write(admin.from("positions").update({
        quantity: newQty,
        total_invested: round2(newQty * existing.average_price),
        realized_pnl: round2((existing.realized_pnl ?? 0) + realized),
        current_price: price,
        current_value: round2(newQty * price),
        updated_at: now,
      } as never).eq("id", existing.id));
    }
    return round2(price * order.quantity - charges);
  }

  return 0;
}

/**
 * One pass over all users' PENDING entry orders. Returns the number of orders
 * filled. Best-effort: per-order failures are isolated (a bad contract doesn't
 * stop the pass).
 */
export async function runPendingOrdersOnce(admin: Admin): Promise<number> {
  const { data: orders } = await admin
    .from("orders")
    .select("*")
    .eq("status", "PENDING")
    .returns<Order[]>();
  if (!orders || orders.length === 0) return 0;

  // Resolve LTP per order. Options: one chain fetch per (symbol, expiry).
  // Equity: from live_quotes by symbol. (Mirrors gtt.ts.)
  const chainCache = new Map<string, Map<number, { ce: number; pe: number }>>();
  const getOptionLtp = async (symbol: string, expiry: string, strike: number, side: "CE" | "PE") => {
    const key = `${symbol}|${expiry}`;
    let byStrike = chainCache.get(key);
    if (!byStrike) {
      const chain = await fetchOptionChain(symbol, expiry);
      byStrike = new Map(chain.chain.map((r) => [r.strike_price, { ce: r.ce.ltp, pe: r.pe.ltp }]));
      chainCache.set(key, byStrike);
    }
    const row = byStrike.get(strike);
    return row ? (side === "CE" ? row.ce : row.pe) : 0;
  };

  let actions = 0;
  for (const order of orders) {
    try {
      const isOption = order.instrument_type !== "EQ";
      let currentPrice = 0;
      if (isOption && order.expiry_date && order.strike_price != null) {
        currentPrice = await getOptionLtp(
          order.symbol,
          order.expiry_date,
          order.strike_price,
          order.option_type === "PE" ? "PE" : "CE"
        );
      } else {
        const { data } = await admin
          .from("live_quotes")
          .select("ltp")
          .eq("symbol", order.symbol)
          .maybeSingle<{ ltp: number }>();
        currentPrice = data?.ltp ?? 0;
      }
      if (currentPrice <= 0) continue; // no quote — leave PENDING, retry next pass

      // Re-evaluate the trigger with the pure fill simulator.
      const fill = simulateFill(toFormData(order), currentPrice);
      if (!fill) continue; // condition not met — stays PENDING

      const now = new Date().toISOString();

      // Affordability re-check at the actual fill price.
      if (!(await canAfford(admin, order, fill.executed_price))) {
        await admin
          .from("orders")
          .update({
            status: "REJECTED",
            notes: "Auto: insufficient funds/margin at fill time",
            updated_at: now,
          } as never)
          .eq("id", order.id);
        continue; // not a fill
      }

      // Position write first: if it throws, void the order and move no cash.
      let cashDelta: number;
      try {
        cashDelta = await openFromFill(admin, order, fill);
      } catch (e) {
        await admin
          .from("orders")
          .update({
            status: "REJECTED",
            notes: `Auto: position update failed — ${(e as Error).message}`,
            updated_at: now,
          } as never)
          .eq("id", order.id);
        continue;
      }

      // Mark the order EXECUTED.
      await admin
        .from("orders")
        .update({
          status: "EXECUTED",
          executed_price: fill.executed_price,
          executed_quantity: order.quantity,
          executed_at: now,
          simulated_bid: currentPrice * 0.999,
          simulated_ask: currentPrice * 1.001,
          slippage: fill.slippage,
          brokerage: fill.brokerage,
          updated_at: now,
        } as never)
        .eq("id", order.id);

      // Move virtual cash.
      if (cashDelta >= 0) {
        await admin.rpc("add_virtual_cash" as never, { p_user_id: order.user_id, p_amount: round2(cashDelta) } as never);
      } else {
        await admin.rpc("deduct_virtual_cash" as never, { p_user_id: order.user_id, p_amount: round2(-cashDelta) } as never);
      }

      actions += 1;
    } catch {
      // Isolate per-order failures so one bad row doesn't stop the pass.
      continue;
    }
  }

  return actions;
}
