import { createClient } from "@/lib/supabase/client";
import { getStockQuote } from "@/services/market-data.service";
import { getMarketStatus } from "@/services/dashboard.service";
import { TRADE_CONFIG } from "@/config/trade";
import type {
  Order,
  Position,
  OrderFormData,
  SimulatedFill,
} from "@/types/database";

// --- 1. Simulate Fill ---

export function simulateFill(
  orderData: OrderFormData,
  currentPrice: number
): SimulatedFill | null {
  const { order_type, trade_type, price, trigger_price } = orderData;
  const { slippagePercent, brokeragePerOrder, maxSlippage } = TRADE_CONFIG.simulation;

  if (order_type === "MARKET") {
    const slippage =
      (Math.random() * (slippagePercent - 0.01) + 0.01) / 100;
    const capped = Math.min(slippage, maxSlippage / 100);

    const executedPrice =
      trade_type === "BUY"
        ? currentPrice * (1 + capped)
        : currentPrice * (1 - capped);

    const rounded = Math.round(executedPrice * 100) / 100;
    const slippageAmt = Math.abs(rounded - currentPrice) * orderData.quantity;

    return {
      executed_price: rounded,
      slippage: Math.round(slippageAmt * 100) / 100,
      brokerage: brokeragePerOrder,
      total_charges: Math.round((slippageAmt + brokeragePerOrder) * 100) / 100,
      net_price: rounded,
    };
  }

  if (order_type === "LIMIT" && price !== null) {
    if (trade_type === "BUY" && currentPrice <= price) {
      return {
        executed_price: price,
        slippage: 0,
        brokerage: brokeragePerOrder,
        total_charges: brokeragePerOrder,
        net_price: price,
      };
    }
    if (trade_type === "SELL" && currentPrice >= price) {
      return {
        executed_price: price,
        slippage: 0,
        brokerage: brokeragePerOrder,
        total_charges: brokeragePerOrder,
        net_price: price,
      };
    }
    return null; // stays PENDING
  }

  if ((order_type === "SL" || order_type === "SL-M") && trigger_price !== null) {
    const slippage =
      (Math.random() * (slippagePercent - 0.01) + 0.01) / 100;

    if (trade_type === "BUY" && currentPrice >= trigger_price) {
      const ep = Math.round(trigger_price * (1 + slippage) * 100) / 100;
      return {
        executed_price: ep,
        slippage: Math.round(Math.abs(ep - trigger_price) * orderData.quantity * 100) / 100,
        brokerage: brokeragePerOrder,
        total_charges: Math.round((Math.abs(ep - trigger_price) * orderData.quantity + brokeragePerOrder) * 100) / 100,
        net_price: ep,
      };
    }
    if (trade_type === "SELL" && currentPrice <= trigger_price) {
      const ep = Math.round(trigger_price * (1 - slippage) * 100) / 100;
      return {
        executed_price: ep,
        slippage: Math.round(Math.abs(trigger_price - ep) * orderData.quantity * 100) / 100,
        brokerage: brokeragePerOrder,
        total_charges: Math.round((Math.abs(trigger_price - ep) * orderData.quantity + brokeragePerOrder) * 100) / 100,
        net_price: ep,
      };
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

  if (orderData.order_type === "LIMIT" && (orderData.price === null || orderData.price <= 0)) {
    errors.push("Limit price is required and must be greater than 0");
  }

  if ((orderData.order_type === "SL" || orderData.order_type === "SL-M") &&
    (orderData.trigger_price === null || orderData.trigger_price <= 0)) {
    errors.push("Trigger price is required for stop loss orders");
  }

  const supabase = createClient();

  if (orderData.trade_type === "BUY") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("virtual_balance")
      .eq("id", userId)
      .single<{ virtual_balance: number }>();

    const estimatedCost = orderData.quantity * (orderData.price ?? 0) + TRADE_CONFIG.simulation.brokeragePerOrder;
    if (profile && estimatedCost > profile.virtual_balance) {
      errors.push(
        `Insufficient virtual cash. Available: ₹${profile.virtual_balance.toLocaleString("en-IN")}, Required: ₹${estimatedCost.toLocaleString("en-IN")}`
      );
    }
  }

  if (orderData.trade_type === "SELL") {
    const { data: position } = await supabase
      .from("positions")
      .select("quantity")
      .eq("user_id", userId)
      .eq("symbol", orderData.symbol)
      .eq("status", "OPEN")
      .single<{ quantity: number }>();

    if (!position || position.quantity < orderData.quantity) {
      errors.push(
        `Insufficient quantity. You hold ${position?.quantity ?? 0} shares of ${orderData.symbol}`
      );
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
  orderData: OrderFormData
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

    // Step 2: Get current price
    let currentPrice = orderData.price ?? 0;
    const quote = await getStockQuote(orderData.symbol, orderData.exchange);
    if (quote) {
      currentPrice = quote.last_price;
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

    // Step 5 & 6: Update position and cash only if executed
    if (isExecuted && fill) {
      await updatePosition(userId, insertedOrder, fill);

      const totalAmount = fill.executed_price * orderData.quantity + fill.brokerage;

      if (orderData.trade_type === "BUY") {
        await supabase.rpc("deduct_virtual_cash" as never, {
          p_user_id: userId,
          p_amount: totalAmount,
        } as never);
      } else {
        await supabase.rpc("add_virtual_cash" as never, {
          p_user_id: userId,
          p_amount: totalAmount - fill.brokerage * 2,
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
  fill: SimulatedFill
): Promise<void> {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("positions")
    .select("*")
    .eq("user_id", userId)
    .eq("symbol", order.symbol)
    .eq("status", "OPEN")
    .single<Position>();

  if (order.trade_type === "BUY") {
    if (existing) {
      const newQty = existing.quantity + order.quantity;
      const newAvgPrice =
        (existing.quantity * existing.average_price +
          order.quantity * fill.executed_price) /
        newQty;
      const newInvested = newQty * newAvgPrice;

      await supabase
        .from("positions")
        .update({
          quantity: newQty,
          average_price: Math.round(newAvgPrice * 100) / 100,
          total_invested: Math.round(newInvested * 100) / 100,
          current_price: fill.executed_price,
          current_value: Math.round(newQty * fill.executed_price * 100) / 100,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", existing.id);
    } else {
      const invested = order.quantity * fill.executed_price;
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
        quantity: order.quantity,
        average_price: fill.executed_price,
        total_invested: Math.round(invested * 100) / 100,
        current_price: fill.executed_price,
        current_value: Math.round(invested * 100) / 100,
        pnl: 0,
        pnl_percent: 0,
        day_pnl: 0,
        status: "OPEN",
        opened_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never);
    }
  }

  if (order.trade_type === "SELL" && existing) {
    const newQty = existing.quantity - order.quantity;

    if (newQty <= 0) {
      const realizedPnl =
        (fill.executed_price - existing.average_price) * order.quantity;

      await supabase
        .from("positions")
        .update({
          quantity: 0,
          pnl: Math.round(realizedPnl * 100) / 100,
          pnl_percent:
            existing.total_invested > 0
              ? Math.round((realizedPnl / existing.total_invested) * 10000) / 100
              : 0,
          status: "CLOSED",
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", existing.id);
    } else {
      const newInvested = newQty * existing.average_price;
      const unrealizedPnl =
        (fill.executed_price - existing.average_price) * newQty;

      await supabase
        .from("positions")
        .update({
          quantity: newQty,
          total_invested: Math.round(newInvested * 100) / 100,
          current_price: fill.executed_price,
          current_value: Math.round(newQty * fill.executed_price * 100) / 100,
          pnl: Math.round(unrealizedPnl * 100) / 100,
          pnl_percent:
            newInvested > 0
              ? Math.round((unrealizedPnl / newInvested) * 10000) / 100
              : 0,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", existing.id);
    }
  }
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
  userId: string
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

    return await placeOrder(userId, {
      symbol: position.symbol,
      exchange: position.exchange,
      instrument_type: position.instrument_type as "EQ" | "CE" | "PE",
      option_type: (position.option_type as "CE" | "PE") ?? null,
      strike_price: position.strike_price,
      expiry_date: position.expiry_date,
      lot_size: position.lot_size,
      order_type: "MARKET",
      trade_type: "SELL",
      quantity: position.quantity,
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

// --- 6. Calculate P&L ---

export function calculatePnL(
  position: Position,
  currentPrice: number
): { pnl: number; pnlPercent: number } {
  const unrealizedPnl =
    (currentPrice - position.average_price) * position.quantity;
  const pnlPercent =
    position.total_invested > 0
      ? (unrealizedPnl / position.total_invested) * 100
      : 0;

  return {
    pnl: Math.round(unrealizedPnl * 100) / 100,
    pnlPercent: Math.round(pnlPercent * 100) / 100,
  };
}
