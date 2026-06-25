import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOptionChain } from "@/lib/market-data/option-chain";
import { TRADE_CONFIG } from "@/config/trade";
import { POSITIONS_CONFIG } from "@/config/positions";
import { getMarketStatus } from "@/services/dashboard.service";
import type { Position } from "@/types/database";

// ============================================================================
// Server-side GTT / auto-square-off
// ----------------------------------------------------------------------------
// Runs inside the snapshot flow (the cron loop on Pro; per client-poll on
// Hobby). For every open position that carries SL / target / trailing / scale-
// out levels, it fetches the live option premium, evaluates the trigger
// direction-aware, and closes (full or partial) server-side — so exits fire
// even when no browser tab is open. Mirrors the client logic in
// positions/page.tsx and the close math in trade-engine.service.ts.
// ============================================================================

type Admin = ReturnType<typeof createAdminClient>;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Statutory charges for one close leg (mirrors trade-engine calculateCharges).
function closeCharges(turnover: number, side: "BUY" | "SELL", isOption: boolean): number {
  const brokerage = TRADE_CONFIG.simulation.brokeragePerOrder;
  const r = isOption ? TRADE_CONFIG.charges.option : TRADE_CONFIG.charges.equity;
  const stt = (side === "SELL" ? r.sttSell : r.sttBuy) * turnover;
  const txn = r.txn * turnover;
  const sebi = r.sebi * turnover;
  const stamp = side === "BUY" ? r.stampBuy * turnover : 0;
  const gst = r.gst * (brokerage + txn + sebi);
  return round2(brokerage + stt + txn + sebi + stamp + gst);
}

// Closes (or reduces) a position at `ltp` server-side: writes an EXECUTED order,
// updates the position row, and moves virtual cash. Direction-aware.
async function closeAt(admin: Admin, p: Position, ltp: number, qty: number, reason: string): Promise<void> {
  const closeQty = Math.min(qty, p.quantity);
  if (closeQty <= 0 || ltp <= 0) return;
  const isOption = p.instrument_type !== "EQ";
  const now = new Date().toISOString();
  const closeSide: "BUY" | "SELL" = p.direction === "SHORT" ? "BUY" : "SELL";
  const charges = closeCharges(ltp * closeQty, closeSide, isOption);
  const remaining = p.quantity - closeQty;

  // Realized P&L + cash delta (signed; + credits the user).
  let realized: number;
  let cashDelta: number;
  let marginReleased = 0;
  if (p.direction === "SHORT") {
    marginReleased = p.quantity > 0 ? round2(p.margin_blocked * (closeQty / p.quantity)) : 0;
    realized = round2((p.average_price - ltp) * closeQty);
    cashDelta = round2(marginReleased - ltp * closeQty - charges);
  } else {
    realized = round2((ltp - p.average_price) * closeQty);
    cashDelta = round2(ltp * closeQty - charges);
  }

  // 1. Order row (so it shows in fills / journal).
  await admin.from("orders").insert({
    user_id: p.user_id,
    symbol: p.symbol,
    exchange: p.exchange,
    instrument_type: p.instrument_type,
    company_name: p.company_name,
    option_type: p.option_type,
    strike_price: p.strike_price,
    expiry_date: p.expiry_date,
    lot_size: p.lot_size,
    order_type: "MARKET",
    trade_type: closeSide,
    quantity: closeQty,
    price: null,
    trigger_price: null,
    status: "EXECUTED",
    executed_price: ltp,
    executed_quantity: closeQty,
    executed_at: now,
    slippage: 0,
    brokerage: TRADE_CONFIG.simulation.brokeragePerOrder,
    notes: `Auto: ${reason}`,
    updated_at: now,
  } as never);

  // 2. Position update.
  if (remaining <= 0) {
    await admin.from("positions").update({
      quantity: 0,
      margin_blocked: 0,
      realized_pnl: round2((p.realized_pnl ?? 0) + realized),
      pnl: realized,
      pnl_percent: p.total_invested > 0 ? round2((realized / p.total_invested) * 100) : 0,
      current_price: ltp,
      status: "CLOSED",
      closed_at: now,
      updated_at: now,
    } as never).eq("id", p.id);
  } else {
    await admin.from("positions").update({
      quantity: remaining,
      margin_blocked: p.direction === "SHORT" ? round2(p.margin_blocked - marginReleased) : p.margin_blocked,
      total_invested: round2(remaining * p.average_price),
      realized_pnl: round2((p.realized_pnl ?? 0) + realized),
      current_price: ltp,
      current_value: round2(remaining * ltp),
      updated_at: now,
    } as never).eq("id", p.id);
  }

  // 3. Cash.
  if (cashDelta >= 0) {
    await admin.rpc("add_virtual_cash" as never, { p_user_id: p.user_id, p_amount: cashDelta } as never);
  } else {
    await admin.rpc("deduct_virtual_cash" as never, { p_user_id: p.user_id, p_amount: round2(-cashDelta) } as never);
  }
}

/**
 * One GTT pass over all users' open positions with risk levels. Returns the
 * number of close actions taken. Best-effort: per-position failures are isolated.
 */
export async function runGttOnce(admin: Admin): Promise<number> {
  const { data: positions } = await admin
    .from("positions")
    .select("*")
    .eq("status", "OPEN")
    .or("stop_loss.not.is.null,target.not.is.null,trail_amount.not.is.null,targets.not.is.null")
    .returns<Position[]>();
  if (!positions || positions.length === 0) return 0;

  // Resolve LTP per position. Options: one chain fetch per (symbol, expiry).
  // Equity: from live_quotes by symbol.
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
  for (const p of positions) {
    try {
      const isOption = p.instrument_type === "EQ" ? false : true;
      let ltp = 0;
      if (isOption && p.expiry_date && p.strike_price != null) {
        ltp = await getOptionLtp(p.symbol, p.expiry_date, p.strike_price, p.option_type === "PE" ? "PE" : "CE");
      } else {
        const { data } = await admin.from("live_quotes").select("ltp").eq("symbol", p.symbol).maybeSingle<{ ltp: number }>();
        ltp = data?.ltp ?? 0;
      }
      if (ltp <= 0) continue;

      const isShort = p.direction === "SHORT";

      // SL / target (one close ends this position).
      const hitSL = p.stop_loss != null && (isShort ? ltp >= p.stop_loss : ltp <= p.stop_loss);
      const hitTarget = p.target != null && (isShort ? ltp <= p.target : ltp >= p.target);
      if (hitSL || hitTarget) {
        await closeAt(admin, p, ltp, p.quantity, hitSL ? "stop-loss" : "target");
        actions += 1;
        continue;
      }

      // Trailing stop — ratchet persisted in trail_peak.
      if (p.trail_amount != null && p.trail_amount > 0) {
        if (isShort) {
          const trough = Math.min(p.trail_peak ?? ltp, ltp);
          if (ltp >= trough + p.trail_amount) {
            await closeAt(admin, p, ltp, p.quantity, "trailing-stop");
            actions += 1;
            continue;
          }
          if (trough !== p.trail_peak) await admin.from("positions").update({ trail_peak: trough } as never).eq("id", p.id);
        } else {
          const peak = Math.max(p.trail_peak ?? ltp, ltp);
          if (ltp <= peak - p.trail_amount) {
            await closeAt(admin, p, ltp, p.quantity, "trailing-stop");
            actions += 1;
            continue;
          }
          if (peak !== p.trail_peak) await admin.from("positions").update({ trail_peak: peak } as never).eq("id", p.id);
        }
      }

      // Scale-out targets — partial close each reached level; drop fired levels.
      if (p.targets && p.targets.length > 0) {
        const remainingLevels: { price: number; qty: number }[] = [];
        let fired = false;
        for (const t of p.targets) {
          const reached = isShort ? ltp <= t.price : ltp >= t.price;
          if (reached && !fired) {
            await closeAt(admin, p, ltp, Math.min(t.qty, p.quantity), `scale-out @ ${t.price}`);
            fired = true;
            actions += 1;
          } else {
            remainingLevels.push(t);
          }
        }
        // Persist remaining levels (one fired per pass to keep qty math simple).
        if (fired) await admin.from("positions").update({ targets: remainingLevels.length ? remainingLevels : null } as never).eq("id", p.id);
      }
    } catch {
      // Isolate per-position failures so one bad contract doesn't stop the pass.
      continue;
    }
  }

  // Auto square-off: once past the cutoff (and while the market is open), close
  // EVERY open position of users who opted in — server-side, so it fires even
  // with no browser tab open (the client toggle only worked while the page was).
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const istMins = ist.getHours() * 60 + ist.getMinutes();
  const cutoffMins = POSITIONS_CONFIG.squareOff.hour * 60 + POSITIONS_CONFIG.squareOff.minute;
  if (getMarketStatus() && istMins >= cutoffMins) {
    const { data: optedIn } = await admin
      .from("profiles")
      .select("id")
      .eq("auto_square_off", true)
      .returns<{ id: string }[]>();
    const ids = (optedIn ?? []).map((u) => u.id);
    if (ids.length > 0) {
      const { data: toClose } = await admin
        .from("positions")
        .select("*")
        .eq("status", "OPEN")
        .in("user_id", ids)
        .returns<Position[]>();
      for (const p of toClose ?? []) {
        try {
          let ltp = 0;
          if (p.instrument_type !== "EQ" && p.expiry_date && p.strike_price != null) {
            ltp = await getOptionLtp(p.symbol, p.expiry_date, p.strike_price, p.option_type === "PE" ? "PE" : "CE");
          } else {
            const { data } = await admin.from("live_quotes").select("ltp").eq("symbol", p.symbol).maybeSingle<{ ltp: number }>();
            ltp = data?.ltp ?? 0;
          }
          if (ltp > 0) {
            await closeAt(admin, p, ltp, p.quantity, "auto square-off");
            actions += 1;
          }
        } catch {
          continue;
        }
      }
    }
  }

  return actions;
}
