import { createClient } from "@/lib/supabase/client";
import { getStockQuote, getOptionLtp } from "@/services/market-data.service";
import { getMarketStatus } from "@/services/dashboard.service";
import { TRADE_CONFIG } from "@/config/trade";
import type {
  Order,
  Position,
  OrderFormData,
  SimulatedFill,
  ChargeBreakdown,
} from "@/types/database";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Margin blocked when writing (selling-to-open) a contract: a fraction of the
 * notional. Options use the strike as the notional base; equity uses price.
 * Paper-sim estimate (see TRADE_CONFIG.simulation.shortMarginPercent).
 */
function shortMarginFor(orderData: OrderFormData, refPrice: number): number {
  const base = orderData.instrument_type === "EQ" ? refPrice : orderData.strike_price ?? refPrice;
  return round2(base * orderData.quantity * TRADE_CONFIG.simulation.shortMarginPercent);
}

/**
 * The open position matching a full contract key (symbol + instrument + strike +
 * expiry + side), or null. Options share a `symbol`, so matching on symbol alone
 * is wrong — every open/add/close must key on the exact contract.
 */
async function findOpenPosition(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  c: {
    symbol: string;
    instrument_type: string;
    option_type: "CE" | "PE" | null;
    strike_price: number | null;
    expiry_date: string | null;
  }
): Promise<Position | null> {
  let q = supabase
    .from("positions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "OPEN")
    .eq("symbol", c.symbol)
    .eq("instrument_type", c.instrument_type);
  q = c.strike_price == null ? q.is("strike_price", null) : q.eq("strike_price", c.strike_price);
  q = c.expiry_date == null ? q.is("expiry_date", null) : q.eq("expiry_date", c.expiry_date);
  q = c.option_type == null ? q.is("option_type", null) : q.eq("option_type", c.option_type);
  const { data } = await q.maybeSingle<Position>();
  return data ?? null;
}

/**
 * Approximate Indian statutory charges for one order leg, so paper fills read
 * like a real contract note. Slippage is NOT included here — it's already baked
 * into the executed price.
 */
function calculateCharges(
  turnover: number,
  side: "BUY" | "SELL",
  isOption: boolean
): ChargeBreakdown {
  const brokerage = TRADE_CONFIG.simulation.brokeragePerOrder;
  const r = isOption ? TRADE_CONFIG.charges.option : TRADE_CONFIG.charges.equity;
  const stt = (side === "SELL" ? r.sttSell : r.sttBuy) * turnover;
  const txn = r.txn * turnover;
  const sebi = r.sebi * turnover;
  const stamp = side === "BUY" ? r.stampBuy * turnover : 0;
  const gst = r.gst * (brokerage + txn + sebi);
  const total = brokerage + stt + txn + sebi + stamp + gst;
  return {
    brokerage: round2(brokerage),
    stt: round2(stt),
    txn: round2(txn),
    sebi: round2(sebi),
    stamp: round2(stamp),
    gst: round2(gst),
    total: round2(total),
  };
}

function buildFill(
  executedPrice: number,
  slippageAmt: number,
  side: "BUY" | "SELL",
  qty: number,
  isOption: boolean
): SimulatedFill {
  const ep = round2(executedPrice);
  const charges = calculateCharges(ep * qty, side, isOption);
  return {
    executed_price: ep,
    slippage: round2(slippageAmt),
    brokerage: charges.brokerage,
    total_charges: charges.total,
    net_price: ep,
    charges,
  };
}

// --- 1. Simulate Fill ---

export function simulateFill(
  orderData: OrderFormData,
  currentPrice: number
): SimulatedFill | null {
  const { order_type, trade_type, price, trigger_price } = orderData;
  const { slippagePercent, maxSlippage } = TRADE_CONFIG.simulation;
  const isOption = orderData.instrument_type !== "EQ";
  const qty = orderData.quantity;

  if (order_type === "MARKET") {
    const slippage = (Math.random() * (slippagePercent - 0.01) + 0.01) / 100;
    const capped = Math.min(slippage, maxSlippage / 100);
    const executedPrice =
      trade_type === "BUY" ? currentPrice * (1 + capped) : currentPrice * (1 - capped);
    const rounded = round2(executedPrice);
    const slippageAmt = Math.abs(rounded - currentPrice) * qty;
    return buildFill(rounded, slippageAmt, trade_type, qty, isOption);
  }

  if (order_type === "LIMIT" && price !== null) {
    if (trade_type === "BUY" && currentPrice <= price) {
      return buildFill(price, 0, "BUY", qty, isOption);
    }
    if (trade_type === "SELL" && currentPrice >= price) {
      return buildFill(price, 0, "SELL", qty, isOption);
    }
    return null; // stays PENDING
  }

  if ((order_type === "SL" || order_type === "SL-M") && trigger_price !== null) {
    const slippage = (Math.random() * (slippagePercent - 0.01) + 0.01) / 100;
    if (trade_type === "BUY" && currentPrice >= trigger_price) {
      const ep = round2(trigger_price * (1 + slippage));
      return buildFill(ep, Math.abs(ep - trigger_price) * qty, "BUY", qty, isOption);
    }
    if (trade_type === "SELL" && currentPrice <= trigger_price) {
      const ep = round2(trigger_price * (1 - slippage));
      return buildFill(ep, Math.abs(trigger_price - ep) * qty, "SELL", qty, isOption);
    }
    return null; // stays PENDING
  }

  return null;
}

// --- 7. Validate Order ---

export async function validateOrder(
  userId: string,
  orderData: OrderFormData
): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (orderData.quantity <= 0) {
    errors.push("Quantity must be greater than 0");
  }

  // Derivatives trade in whole lots.
  if (
    orderData.instrument_type !== "EQ" &&
    orderData.lot_size > 0 &&
    orderData.quantity % orderData.lot_size !== 0
  ) {
    errors.push(`Quantity must be in multiples of the lot size (${orderData.lot_size})`);
  }

  if (orderData.order_type === "LIMIT" && (orderData.price === null || orderData.price <= 0)) {
    errors.push("Limit price is required and must be greater than 0");
  }

  if ((orderData.order_type === "SL" || orderData.order_type === "SL-M") &&
    (orderData.trigger_price === null || orderData.trigger_price <= 0)) {
    errors.push("Trigger price is required for stop loss orders");
  }

  const supabase = createClient();

  // Reference price (MARKET orders carry none): live price so every funds/margin
  // check is real.
  let refPrice = orderData.price ?? 0;
  if (refPrice <= 0) {
    if (orderData.instrument_type === "EQ") {
      const q = await getStockQuote(orderData.symbol, orderData.exchange);
      refPrice = q?.last_price ?? 0;
    } else {
      refPrice =
        (await getOptionLtp(
          orderData.symbol,
          orderData.expiry_date,
          orderData.strike_price,
          orderData.instrument_type === "PE" ? "PE" : "CE"
        )) ?? 0;
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("virtual_balance")
    .eq("id", userId)
    .single<{ virtual_balance: number }>();
  const balance = profile?.virtual_balance ?? 0;
  const brokerage = TRADE_CONFIG.simulation.brokeragePerOrder;
  const existing = await findOpenPosition(supabase, userId, orderData);

  if (orderData.trade_type === "BUY") {
    if (existing && existing.direction === "SHORT") {
      // Buy-to-close a short: buyback cost net of the margin we'll release.
      const closeQty = Math.min(orderData.quantity, existing.quantity);
      const marginReleased =
        existing.quantity > 0 ? existing.margin_blocked * (closeQty / existing.quantity) : 0;
      const buyback = orderData.quantity * refPrice + brokerage;
      if (refPrice > 0 && buyback > balance + marginReleased) {
        errors.push(
          `Insufficient funds to close short. Available (incl. released margin): ₹${(balance + marginReleased).toLocaleString("en-IN")}, Required: ₹${buyback.toLocaleString("en-IN")}`
        );
      }
    } else {
      // Buy-to-open / add long: pay premium + brokerage from cash.
      const estimatedCost = orderData.quantity * refPrice + brokerage;
      if (refPrice > 0 && estimatedCost > balance) {
        errors.push(
          `Insufficient virtual cash. Available: ₹${balance.toLocaleString("en-IN")}, Required: ₹${estimatedCost.toLocaleString("en-IN")}`
        );
      }
    }
  }

  if (orderData.trade_type === "SELL") {
    if (existing && existing.direction === "LONG") {
      // Sell-to-close a long. No flipping in a single order.
      if (existing.quantity < orderData.quantity) {
        errors.push(
          `You hold ${existing.quantity} (long). Reduce the quantity to close, or close the long before writing.`
        );
      }
    } else {
      // Sell-to-open / add short: block margin (net of premium received).
      const margin = shortMarginFor(orderData, refPrice);
      const premium = orderData.quantity * refPrice;
      const required = Math.max(0, margin - premium) + brokerage;
      if (refPrice > 0 && required > balance) {
        errors.push(
          `Insufficient margin to write. Available: ₹${balance.toLocaleString("en-IN")}, Margin required: ₹${required.toLocaleString("en-IN")}`
        );
      }
    }
  }

  if (!getMarketStatus()) {
    errors.push("Warning: Market is currently closed. Order will use last closing price.");
  }

  return { isValid: errors.filter((e) => !e.startsWith("Warning:")).length === 0, errors };
}

// --- 2. Place Order ---

export interface OrderResult {
  success: boolean;
  order: Order | null;
  fill: SimulatedFill | null;
  message: string;
}

export async function placeOrder(
  userId: string,
  orderData: OrderFormData,
  risk?: { stop_loss?: number | null; target?: number | null }
): Promise<OrderResult> {
  try {
    // Step 1: Validate
    const validation = await validateOrder(userId, orderData);
    if (!validation.isValid) {
      return {
        success: false,
        order: null,
        fill: null,
        message: validation.errors.filter((e) => !e.startsWith("Warning:")).join(". "),
      };
    }

    // Step 2: Get current price. Equities quote the symbol; options must price
    // the contract from the chain (the underlying spot would be wrong).
    let currentPrice = orderData.price ?? 0;
    if (orderData.instrument_type === "EQ") {
      const quote = await getStockQuote(orderData.symbol, orderData.exchange);
      if (quote) currentPrice = quote.last_price;
    } else {
      const premium = await getOptionLtp(
        orderData.symbol,
        orderData.expiry_date,
        orderData.strike_price,
        orderData.instrument_type === "PE" ? "PE" : "CE"
      );
      if (premium) currentPrice = premium;
    }

    if (currentPrice <= 0) {
      return {
        success: false,
        order: null,
        fill: null,
        message: "Unable to get current market price",
      };
    }

    // Step 3: Simulate fill
    const fill = simulateFill({ ...orderData, price: orderData.price ?? currentPrice }, currentPrice);
    const isExecuted = fill !== null;

    const supabase = createClient();

    // Step 4: Insert order
    const orderRow = {
      user_id: userId,
      symbol: orderData.symbol,
      exchange: orderData.exchange,
      instrument_type: orderData.instrument_type,
      company_name: null,
      option_type: orderData.option_type,
      strike_price: orderData.strike_price,
      expiry_date: orderData.expiry_date,
      lot_size: orderData.lot_size,
      order_type: orderData.order_type,
      trade_type: orderData.trade_type,
      quantity: orderData.quantity,
      price: orderData.price,
      trigger_price: orderData.trigger_price,
      status: isExecuted ? "EXECUTED" : "PENDING",
      executed_price: fill?.executed_price ?? null,
      executed_quantity: isExecuted ? orderData.quantity : null,
      executed_at: isExecuted ? new Date().toISOString() : null,
      simulated_bid: currentPrice * 0.999,
      simulated_ask: currentPrice * 1.001,
      slippage: fill?.slippage ?? 0,
      brokerage: fill?.brokerage ?? 0,
      strategy_id: null,
      strategy_name: null,
      notes: orderData.notes,
      tags: null,
      updated_at: new Date().toISOString(),
    };

    const { data: insertedOrder, error: orderError } = await supabase
      .from("orders")
      .insert(orderRow as never)
      .select()
      .single<Order>();

    if (orderError || !insertedOrder) {
      return {
        success: false,
        order: null,
        fill,
        message: orderError?.message ?? "Failed to place order",
      };
    }

    // Step 5 & 6: Update position and cash only if executed. updatePosition owns
    // the cash math (it knows whether this opens/closes a long or a short) and
    // returns the signed cash delta: positive credits the user, negative debits.
    if (isExecuted && fill) {
      const cashDelta = await updatePosition(userId, insertedOrder, fill, risk);
      if (cashDelta >= 0) {
        await supabase.rpc("add_virtual_cash" as never, {
          p_user_id: userId,
          p_amount: round2(cashDelta),
        } as never);
      } else {
        await supabase.rpc("deduct_virtual_cash" as never, {
          p_user_id: userId,
          p_amount: round2(-cashDelta),
        } as never);
      }
    }

    return {
      success: true,
      order: insertedOrder,
      fill,
      message: isExecuted
        ? `${orderData.trade_type} order executed at ₹${fill!.executed_price.toFixed(2)}`
        : `${orderData.order_type} order placed. Waiting for execution.`,
    };
  } catch (e) {
    return {
      success: false,
      order: null,
      fill: null,
      message: (e as Error).message ?? "Order placement failed",
    };
  }
}

// --- 3. Update Position ---

async function updatePosition(
  userId: string,
  order: Order,
  fill: SimulatedFill,
  risk?: { stop_loss?: number | null; target?: number | null }
): Promise<number> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const price = fill.executed_price;
  const charges = fill.total_charges;
  const pct = TRADE_CONFIG.simulation.shortMarginPercent;
  const marginBase = order.instrument_type === "EQ" ? price : order.strike_price ?? price;
  const marginForQty = (q: number) => round2(marginBase * q * pct);

  const existing = await findOpenPosition(supabase, userId, order);

  // --- Close / reduce a SHORT (buy-to-close) ---
  if (existing && existing.direction === "SHORT" && order.trade_type === "BUY") {
    const closeQty = Math.min(order.quantity, existing.quantity);
    const marginReleased =
      existing.quantity > 0 ? round2(existing.margin_blocked * (closeQty / existing.quantity)) : 0;
    const realized = round2((existing.average_price - price) * closeQty);
    const cashDelta = round2(marginReleased - price * closeQty - charges);
    const remaining = existing.quantity - closeQty;

    if (remaining <= 0) {
      await supabase.from("positions").update({
        quantity: 0,
        margin_blocked: 0,
        realized_pnl: round2((existing.realized_pnl ?? 0) + realized),
        pnl: realized,
        pnl_percent: existing.total_invested > 0 ? round2((realized / existing.total_invested) * 100) : 0,
        current_price: price,
        status: "CLOSED",
        closed_at: now,
        updated_at: now,
      } as never).eq("id", existing.id);
    } else {
      await supabase.from("positions").update({
        quantity: remaining,
        margin_blocked: round2(existing.margin_blocked - marginReleased),
        total_invested: round2(remaining * existing.average_price),
        realized_pnl: round2((existing.realized_pnl ?? 0) + realized),
        current_price: price,
        current_value: round2(remaining * price),
        updated_at: now,
      } as never).eq("id", existing.id);
    }
    return cashDelta;
  }

  // --- Add to a SHORT (sell-to-open more) ---
  if (existing && existing.direction === "SHORT" && order.trade_type === "SELL") {
    const newQty = existing.quantity + order.quantity;
    const newAvg = round2(
      (existing.quantity * existing.average_price + order.quantity * price) / newQty
    );
    const addMargin = marginForQty(order.quantity);
    const cashDelta = round2(price * order.quantity - charges - addMargin);
    await supabase.from("positions").update({
      quantity: newQty,
      average_price: newAvg,
      total_invested: round2(newQty * newAvg),
      margin_blocked: round2(existing.margin_blocked + addMargin),
      current_price: price,
      current_value: round2(newQty * price),
      updated_at: now,
    } as never).eq("id", existing.id);
    return cashDelta;
  }

  // --- Open a new SHORT (sell-to-open, no existing position) ---
  if (!existing && order.trade_type === "SELL") {
    const margin = marginForQty(order.quantity);
    const invested = round2(order.quantity * price); // premium notional collected
    const cashDelta = round2(price * order.quantity - charges - margin);
    await supabase.from("positions").insert({
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
      stop_loss: risk?.stop_loss ?? null,
      target: risk?.target ?? null,
      opened_at: now,
      updated_at: now,
    } as never);
    return cashDelta;
  }

  // --- LONG: add / open (buy) ---
  if (order.trade_type === "BUY") {
    if (existing) {
      const newQty = existing.quantity + order.quantity;
      const newAvg = round2(
        (existing.quantity * existing.average_price + order.quantity * price) / newQty
      );
      await supabase.from("positions").update({
        quantity: newQty,
        average_price: newAvg,
        total_invested: round2(newQty * newAvg),
        current_price: price,
        current_value: round2(newQty * price),
        updated_at: now,
      } as never).eq("id", existing.id);
    } else {
      const invested = round2(order.quantity * price);
      await supabase.from("positions").insert({
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
        stop_loss: risk?.stop_loss ?? null,
        target: risk?.target ?? null,
        opened_at: now,
        updated_at: now,
      } as never);
    }
    return round2(-(price * order.quantity + charges));
  }

  // --- LONG: close / reduce (sell) ---
  if (order.trade_type === "SELL" && existing) {
    const newQty = existing.quantity - order.quantity;
    if (newQty <= 0) {
      const realized = round2((price - existing.average_price) * order.quantity);
      await supabase.from("positions").update({
        quantity: 0,
        realized_pnl: round2((existing.realized_pnl ?? 0) + realized),
        pnl: realized,
        pnl_percent: existing.total_invested > 0 ? round2((realized / existing.total_invested) * 100) : 0,
        current_price: price,
        status: "CLOSED",
        closed_at: now,
        updated_at: now,
      } as never).eq("id", existing.id);
    } else {
      const realized = round2((price - existing.average_price) * order.quantity);
      await supabase.from("positions").update({
        quantity: newQty,
        total_invested: round2(newQty * existing.average_price),
        realized_pnl: round2((existing.realized_pnl ?? 0) + realized),
        current_price: price,
        current_value: round2(newQty * price),
        updated_at: now,
      } as never).eq("id", existing.id);
    }
    return round2(price * order.quantity - charges);
  }

  return 0;
}

// --- 4. Cancel Order ---

export async function cancelOrder(
  orderId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const supabase = createClient();

    const { data: order } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("user_id", userId)
      .single<Order>();

    if (!order) {
      return { success: false, message: "Order not found" };
    }

    if (order.status !== "PENDING") {
      return { success: false, message: `Cannot cancel ${order.status} order` };
    }

    await supabase
      .from("orders")
      .update({
        status: "CANCELLED",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", orderId);

    return { success: true, message: "Order cancelled successfully" };
  } catch {
    return { success: false, message: "Failed to cancel order" };
  }
}

// --- 5. Close Position ---

export async function closePosition(
  positionId: string,
  userId: string,
  qty?: number
): Promise<OrderResult> {
  try {
    const supabase = createClient();

    const { data: position } = await supabase
      .from("positions")
      .select("*")
      .eq("id", positionId)
      .eq("user_id", userId)
      .eq("status", "OPEN")
      .single<Position>();

    if (!position) {
      return {
        success: false,
        order: null,
        fill: null,
        message: "Position not found or already closed",
      };
    }

    // Partial close when a valid smaller qty is passed; otherwise close fully.
    const closeQty =
      qty && qty > 0 && qty < position.quantity ? qty : position.quantity;

    return await placeOrder(userId, {
      symbol: position.symbol,
      exchange: position.exchange,
      instrument_type: position.instrument_type as "EQ" | "CE" | "PE",
      option_type: (position.option_type as "CE" | "PE") ?? null,
      strike_price: position.strike_price,
      expiry_date: position.expiry_date,
      lot_size: position.lot_size,
      order_type: "MARKET",
      // Closing a short means buying it back; a long is sold.
      trade_type: position.direction === "SHORT" ? "BUY" : "SELL",
      quantity: closeQty,
      price: null,
      trigger_price: null,
      notes: "Position closed",
    });
  } catch {
    return {
      success: false,
      order: null,
      fill: null,
      message: "Failed to close position",
    };
  }
}

// --- 8. Add / average into a position ---

export async function addToPosition(
  positionId: string,
  userId: string,
  qty: number
): Promise<OrderResult> {
  try {
    const supabase = createClient();
    const { data: position } = await supabase
      .from("positions")
      .select("*")
      .eq("id", positionId)
      .eq("user_id", userId)
      .eq("status", "OPEN")
      .single<Position>();

    if (!position) {
      return { success: false, order: null, fill: null, message: "Position not found" };
    }

    return await placeOrder(userId, {
      symbol: position.symbol,
      exchange: position.exchange,
      instrument_type: position.instrument_type as "EQ" | "CE" | "PE",
      option_type: (position.option_type as "CE" | "PE") ?? null,
      strike_price: position.strike_price,
      expiry_date: position.expiry_date,
      lot_size: position.lot_size,
      order_type: "MARKET",
      // Adding to a short means selling more; to a long, buying more.
      trade_type: position.direction === "SHORT" ? "SELL" : "BUY",
      quantity: qty > 0 ? qty : position.lot_size || 1,
      price: null,
      trigger_price: null,
      notes: "Add to position",
    });
  } catch {
    return { success: false, order: null, fill: null, message: "Failed to add to position" };
  }
}

// --- 6. Calculate P&L ---

export function calculatePnL(
  position: Position,
  currentPrice: number
): { pnl: number; pnlPercent: number } {
  // Long profits as price rises; short profits as price falls.
  const perUnit =
    position.direction === "SHORT"
      ? position.average_price - currentPrice
      : currentPrice - position.average_price;
  const unrealizedPnl = perUnit * position.quantity;
  const pnlPercent =
    position.total_invested > 0
      ? (unrealizedPnl / position.total_invested) * 100
      : 0;

  return {
    pnl: Math.round(unrealizedPnl * 100) / 100,
    pnlPercent: Math.round(pnlPercent * 100) / 100,
  };
}
