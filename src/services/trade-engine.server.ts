import type { createAdminClient } from "@/lib/supabase/admin";
import type { Position } from "@/types/database";
import type { WebhookPayload, EntryPayload } from "@/lib/tv/schema";
import type { ApplyResult } from "@/lib/tv/processor";
import { TRADE_CONFIG } from "@/config/trade";
import { TV_WEBHOOK_CONFIG } from "@/config/tradingview";
import { getExpiries } from "@/lib/market-data/expiries";
import { fetchOptionChain } from "@/lib/market-data/option-chain";
import { simulateFill } from "@/services/trade-engine.service";

// ============================================================================
// TradingView → trade-engine bridge (server-side, paper trading).
// ----------------------------------------------------------------------------
// Runs ONLY when TV_WEBHOOK_CONFIG.engineExecution is on. Maps a TradingView
// signal to a simulator order in a configured account, using the SERVICE-ROLE
// admin client (webhooks have no user session) and server-side option pricing.
//
// Mapping (decided with the product owner): entry long → BUY ATM CALL, entry
// short → BUY ATM PUT (honoring an explicit option_type when present), at the
// nearest expiry, priced live from the chain; exit → close that contract. Only
// ever BUYs to open and SELLs to close — no option writing — so the short-margin
// path of the client engine is intentionally not reused here.
// ============================================================================

type Admin = ReturnType<typeof createAdminClient>;

export interface EngineResult {
  executed: boolean;
  detail: string;
  orderId?: string;
  positionId?: string;
  realizedPnl?: number;
}

interface LinkRow {
  strategy: string;
  symbol: string;
  user_id: string;
  position_id: string;
  instrument_type: string;
  option_type: string | null;
  strike_price: number | null;
  expiry_date: string | null;
  lot_size: number;
  qty: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const exchangeFor = (symbol: string): string => (symbol === "SENSEX" ? "BSE" : "NSE");

function optionTypeFor(p: EntryPayload): "CE" | "PE" {
  if (p.option_type === "CALL") return "CE";
  if (p.option_type === "PUT") return "PE";
  return p.side === "long" ? "CE" : "PE";
}

/** The configured simulator account (profiles.email → id), or null if unset/missing. */
async function resolveTradeUserId(admin: Admin): Promise<string | null> {
  const email = TV_WEBHOOK_CONFIG.tradeUserEmail;
  if (!email) return null;
  const { data } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

async function getBalance(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin
    .from("profiles")
    .select("virtual_balance")
    .eq("id", userId)
    .single<{ virtual_balance: number }>();
  return data?.virtual_balance ?? 0;
}

/** Live premium + data source of a specific option contract (CE/PE). */
async function priceContract(
  symbol: string,
  expiry: string,
  strike: number,
  optionType: "CE" | "PE"
): Promise<{ premium: number; source: string }> {
  const chain = await fetchOptionChain(symbol, expiry);
  const row = chain.chain.find((r) => r.strike_price === strike);
  const premium = row ? (optionType === "CE" ? row.ce.ltp : row.pe.ltp) : 0;
  return { premium, source: chain.source };
}

// True when the chain only resolved to mock prices and live is required.
const mockBlocked = (source: string): boolean =>
  TV_WEBHOOK_CONFIG.engineRequireLive && source === "mock";

/** Nearest-expiry ATM contract + its live premium for a fresh entry. */
async function resolveAtm(
  symbol: string,
  optionType: "CE" | "PE"
): Promise<{ expiry: string; strike: number; premium: number; source: string } | null> {
  const { expiries } = await getExpiries(symbol);
  const expiry = expiries[0];
  if (!expiry) return null;
  const chain = await fetchOptionChain(symbol, expiry);
  if (chain.chain.length === 0) return null;
  const row = chain.chain.find((r) => r.strike_price === chain.atmStrike) ?? chain.chain[0];
  const premium = optionType === "CE" ? row.ce.ltp : row.pe.ltp;
  if (!premium || premium <= 0) return null;
  return { expiry, strike: row.strike_price, premium, source: chain.source };
}

// --- Open: BUY the ATM option to open a fresh LONG position ---
async function openAtmPosition(admin: Admin, userId: string, p: EntryPayload): Promise<EngineResult> {
  const symbol = p.symbol.toUpperCase();
  const lotSize = TRADE_CONFIG.defaultLotSizes[symbol];
  if (!lotSize) {
    return { executed: false, detail: `no lot size for ${symbol} — only index options are supported` };
  }

  const optionType = optionTypeFor(p);
  const atm = await resolveAtm(symbol, optionType);
  if (!atm) {
    return { executed: false, detail: `could not price ${symbol} ${optionType} (no live chain/premium)` };
  }
  // Never open at a fabricated price (live providers down / token expired).
  if (mockBlocked(atm.source)) {
    return {
      executed: false,
      detail: `skipped — no live option pricing for ${symbol} (source=mock); reconnect the broker or set TV_ENGINE_REQUIRE_LIVE=false`,
    };
  }

  const quantity = Math.max(1, Math.round(p.qty)) * lotSize;
  const fill = simulateFill(
    {
      symbol,
      exchange: exchangeFor(symbol),
      instrument_type: optionType,
      option_type: optionType,
      strike_price: atm.strike,
      expiry_date: atm.expiry,
      lot_size: lotSize,
      order_type: "MARKET",
      trade_type: "BUY",
      quantity,
      price: null,
      trigger_price: null,
      notes: null,
    },
    atm.premium
  );
  if (!fill) return { executed: false, detail: "fill simulation returned null" };

  const cost = round2(fill.executed_price * quantity + fill.total_charges);
  const balance = await getBalance(admin, userId);
  if (cost > balance) {
    return {
      executed: false,
      detail: `insufficient virtual cash (need ₹${cost.toLocaleString("en-IN")}, have ₹${balance.toLocaleString("en-IN")})`,
    };
  }

  const now = new Date().toISOString();

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      user_id: userId,
      symbol,
      exchange: exchangeFor(symbol),
      instrument_type: optionType,
      company_name: null,
      option_type: optionType,
      strike_price: atm.strike,
      expiry_date: atm.expiry,
      lot_size: lotSize,
      order_type: "MARKET",
      trade_type: "BUY",
      quantity,
      price: null,
      trigger_price: null,
      status: "EXECUTED",
      executed_price: fill.executed_price,
      executed_quantity: quantity,
      executed_at: now,
      simulated_bid: round2(atm.premium * 0.999),
      simulated_ask: round2(atm.premium * 1.001),
      slippage: fill.slippage,
      brokerage: fill.brokerage,
      strategy_id: null,
      strategy_name: p.strategy,
      notes: `TradingView: ${p.strategy}`,
      tags: null,
      updated_at: now,
    } as never)
    .select("id")
    .single<{ id: string }>();
  if (orderErr || !order) {
    return { executed: false, detail: `order insert failed: ${orderErr?.message ?? "unknown"}` };
  }

  const invested = round2(fill.executed_price * quantity);
  const { data: position, error: posErr } = await admin
    .from("positions")
    .insert({
      user_id: userId,
      symbol,
      exchange: exchangeFor(symbol),
      instrument_type: optionType,
      company_name: null,
      option_type: optionType,
      strike_price: atm.strike,
      expiry_date: atm.expiry,
      lot_size: lotSize,
      direction: "LONG",
      quantity,
      average_price: fill.executed_price,
      total_invested: invested,
      margin_blocked: 0,
      current_price: fill.executed_price,
      current_value: invested,
      pnl: 0,
      pnl_percent: 0,
      day_pnl: 0,
      status: "OPEN",
      stop_loss: p.sl ?? null,
      target: p.tp ?? null,
      opened_at: now,
      updated_at: now,
    } as never)
    .select("id")
    .single<{ id: string }>();
  // A failed positions write must void the order — never leave it executed with
  // no position (and we have not moved cash yet, so nothing to refund).
  if (posErr || !position) {
    await admin
      .from("orders")
      .update({ status: "REJECTED", notes: `Position write failed: ${posErr?.message}`, updated_at: now } as never)
      .eq("id", order.id);
    return { executed: false, detail: `position insert failed: ${posErr?.message ?? "unknown"}` };
  }

  const { error: cashErr } = await admin.rpc("deduct_virtual_cash" as never, {
    p_user_id: userId,
    p_amount: cost,
  } as never);
  // Cash move failed: undo the position + order so the ledger stays consistent.
  if (cashErr) {
    await admin.from("positions").delete().eq("id", position.id);
    await admin
      .from("orders")
      .update({ status: "REJECTED", notes: `Cash deduct failed: ${cashErr.message}`, updated_at: now } as never)
      .eq("id", order.id);
    return { executed: false, detail: `cash deduction failed: ${cashErr.message}` };
  }

  // Record the link so the exit signal can close this exact contract.
  const { error: linkErr } = await admin.from("tv_engine_positions").upsert(
    {
      strategy: p.strategy,
      symbol,
      user_id: userId,
      position_id: position.id,
      instrument_type: optionType,
      option_type: optionType,
      strike_price: atm.strike,
      expiry_date: atm.expiry,
      lot_size: lotSize,
      qty: quantity,
      opened_at: now,
    } as never,
    { onConflict: "strategy,symbol" }
  );
  if (linkErr) {
    // Position stands; only the auto-close link is missing. Surface it loudly.
    console.warn(`[tv-engine] link write failed for ${p.strategy}/${symbol}:`, linkErr.message);
  }

  return {
    executed: true,
    detail: `BUY ${quantity} ${symbol} ${atm.strike}${optionType} @ ₹${fill.executed_price} (${atm.source})`,
    orderId: order.id,
    positionId: position.id,
  };
}

// --- Close: SELL the linked option to close the LONG position ---
async function closeLinkedPosition(
  admin: Admin,
  userId: string,
  strategy: string,
  symbol: string
): Promise<EngineResult> {
  const sym = symbol.toUpperCase();
  const { data: link } = await admin
    .from("tv_engine_positions")
    .select("*")
    .eq("strategy", strategy)
    .eq("symbol", sym)
    .maybeSingle<LinkRow>();
  if (!link) return { executed: false, detail: "no linked engine position to close" };

  const dropLink = () =>
    admin.from("tv_engine_positions").delete().eq("strategy", strategy).eq("symbol", sym);

  const { data: position } = await admin
    .from("positions")
    .select("*")
    .eq("id", link.position_id)
    .eq("status", "OPEN")
    .maybeSingle<Position>();
  if (!position) {
    await dropLink();
    return { executed: false, detail: "linked position already closed" };
  }

  const optionType = (link.option_type as "CE" | "PE") ?? "CE";
  const priced =
    link.expiry_date && link.strike_price != null
      ? await priceContract(sym, link.expiry_date, link.strike_price, optionType)
      : { premium: 0, source: "mock" };
  if (!priced.premium || priced.premium <= 0) {
    return { executed: false, detail: "could not price the contract to close (no live premium)" };
  }
  // Don't book a close at a fabricated price — leave the position open so a later
  // signal (or manual close) handles it once live pricing returns.
  if (mockBlocked(priced.source)) {
    return {
      executed: false,
      detail: `skipped close — no live pricing for ${sym} (source=mock); position left open`,
    };
  }
  const premium = priced.premium;

  const quantity = position.quantity;
  const fill = simulateFill(
    {
      symbol: sym,
      exchange: exchangeFor(sym),
      instrument_type: optionType,
      option_type: optionType,
      strike_price: link.strike_price,
      expiry_date: link.expiry_date,
      lot_size: link.lot_size,
      order_type: "MARKET",
      trade_type: "SELL",
      quantity,
      price: null,
      trigger_price: null,
      notes: null,
    },
    premium
  );
  if (!fill) return { executed: false, detail: "fill simulation returned null" };

  const realized = round2((fill.executed_price - position.average_price) * quantity);
  const proceeds = round2(fill.executed_price * quantity - fill.total_charges);
  const now = new Date().toISOString();

  await admin
    .from("positions")
    .update({
      quantity: 0,
      realized_pnl: round2((position.realized_pnl ?? 0) + realized),
      pnl: realized,
      pnl_percent: position.total_invested > 0 ? round2((realized / position.total_invested) * 100) : 0,
      current_price: fill.executed_price,
      current_value: 0,
      status: "CLOSED",
      closed_at: now,
      updated_at: now,
    } as never)
    .eq("id", position.id);

  const { data: order } = await admin
    .from("orders")
    .insert({
      user_id: userId,
      symbol: sym,
      exchange: exchangeFor(sym),
      instrument_type: optionType,
      company_name: null,
      option_type: optionType,
      strike_price: link.strike_price,
      expiry_date: link.expiry_date,
      lot_size: link.lot_size,
      order_type: "MARKET",
      trade_type: "SELL",
      quantity,
      price: null,
      trigger_price: null,
      status: "EXECUTED",
      executed_price: fill.executed_price,
      executed_quantity: quantity,
      executed_at: now,
      simulated_bid: round2(premium * 0.999),
      simulated_ask: round2(premium * 1.001),
      slippage: fill.slippage,
      brokerage: fill.brokerage,
      strategy_id: null,
      strategy_name: strategy,
      notes: `TradingView exit: ${strategy}`,
      tags: null,
      updated_at: now,
    } as never)
    .select("id")
    .single<{ id: string }>();

  await admin.rpc("add_virtual_cash" as never, { p_user_id: userId, p_amount: proceeds } as never);
  await dropLink();

  return {
    executed: true,
    detail: `SELL ${quantity} ${sym} ${link.strike_price}${optionType} @ ₹${fill.executed_price}, realized ₹${realized}`,
    orderId: order?.id,
    positionId: position.id,
    realizedPnl: realized,
  };
}

/**
 * Execute a TradingView signal in the trade simulator, mirroring the decision the
 * ledger already made (handled). Returns null when engine execution is disabled.
 */
export async function executeOnEngine(
  admin: Admin,
  payload: WebhookPayload,
  handled: ApplyResult["handled"]
): Promise<EngineResult | null> {
  if (!TV_WEBHOOK_CONFIG.engineExecution) return null;

  const userId = await resolveTradeUserId(admin);
  if (!userId) {
    return {
      executed: false,
      detail: "no simulator account resolved (set WEBHOOK_TRADE_USER_EMAIL or ADMIN_EMAIL)",
    };
  }

  if (payload.event === "entry") {
    if (handled === "opened") return openAtmPosition(admin, userId, payload);
    if (handled === "reversed") {
      const closed = await closeLinkedPosition(admin, userId, payload.strategy, payload.symbol);
      const opened = await openAtmPosition(admin, userId, payload);
      return { ...opened, detail: `reverse → close[${closed.detail}] / open[${opened.detail}]` };
    }
    return { executed: false, detail: `entry ${handled} — no engine action` };
  }

  if (handled === "closed") {
    return closeLinkedPosition(admin, userId, payload.strategy, payload.symbol);
  }
  return { executed: false, detail: `exit ${handled} — no engine action` };
}
