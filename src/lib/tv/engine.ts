import { createHash, timingSafeEqual } from "node:crypto";
import type { TvSide, TvExitReason } from "@/types/tradingview";

// Pure paper-trading logic for the TradingView ledger. No DB, no env, no clock —
// everything here is deterministic and unit-tested (engine.test.ts). The
// processor wires these into Supabase writes.
//
// PAPER TRADING ONLY: this computes a directional points×lot proxy. It never
// touches a broker. See the integration-boundary guard in the route/processor.

export const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Auth — constant-time secret comparison
// ---------------------------------------------------------------------------

/**
 * Constant-time equality of the provided secret against the expected one.
 * Both are SHA-256'd first so the buffers are always 32 bytes — this both
 * avoids leaking length via timingSafeEqual's length check and keeps the
 * comparison constant-time regardless of input length.
 */
export function secretsMatch(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Dedupe key
// ---------------------------------------------------------------------------

export interface DedupeInput {
  id?: string | null;
  strategy: string;
  event: string;
  symbol: string;
  price: number;
  time?: string | null;
}

/**
 * Idempotency key: the payload `id` if present, else a hash of
 * (strategy + event + symbol + price + time). Repeats of the same key within
 * the dedupe window are dropped.
 */
export function dedupeKey(p: DedupeInput): string {
  if (p.id != null && String(p.id).trim() !== "") return `id:${p.id}`;
  const raw = `${p.strategy}|${p.event}|${p.symbol}|${p.price}|${p.time ?? ""}`;
  return `h:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
}

// ---------------------------------------------------------------------------
// P&L
// ---------------------------------------------------------------------------

export interface PnlInput {
  side: TvSide;
  entry: number;
  exit: number;
  qty: number;
  pointValue: number;
  costPerOrder: number;
}

export interface PnlResult {
  gross: number;
  cost: number;
  net: number;
}

/**
 * Directional P&L in index points × lot, minus round-trip costs.
 *   gross = (long: exit-entry | short: entry-exit) * qty * pointValue
 *   cost  = costPerOrder * 2   (entry + exit)
 *   net   = gross - cost
 */
export function computePnl({ side, entry, exit, qty, pointValue, costPerOrder }: PnlInput): PnlResult {
  const move = side === "long" ? exit - entry : entry - exit;
  const gross = round2(move * qty * pointValue);
  const cost = round2(costPerOrder * 2);
  const net = round2(gross - cost);
  return { gross, cost, net };
}

// ---------------------------------------------------------------------------
// Exit-reason inference
// ---------------------------------------------------------------------------

export function reasonTolerance(price: number, pct: number, absMin: number): number {
  return Math.max(Math.abs(price) * pct, absMin);
}

/**
 * Classify an exit fill by comparing its price to the stored sl/tp. tp wins ties
 * (checked first). null sl/tp can never match. Anything else is "manual".
 */
export function inferExitReason(
  exitPrice: number,
  sl: number | null | undefined,
  tp: number | null | undefined,
  tolerance: number
): Exclude<TvExitReason, "reverse"> {
  if (tp != null && Math.abs(exitPrice - tp) <= tolerance) return "tp";
  if (sl != null && Math.abs(exitPrice - sl) <= tolerance) return "sl";
  return "manual";
}

// ---------------------------------------------------------------------------
// Entry decision (pyramiding / reverse rules)
// ---------------------------------------------------------------------------

export type EntryDecision =
  | { action: "open" }
  | { action: "reverse_then_open" }
  | { action: "ignore"; reason: string };

/**
 * Given the currently-open position (if any) for a (strategy, symbol) and an
 * incoming ENTRY side, decide what to do:
 *   - no open position            -> open
 *   - same direction already open -> ignore (no pyramiding)
 *   - opposite direction open     -> reverse_then_open if allowReverse, else ignore
 */
export function decideEntry(
  existingSide: TvSide | null | undefined,
  signalSide: TvSide,
  allowReverse: boolean
): EntryDecision {
  if (!existingSide) return { action: "open" };
  if (existingSide === signalSide) {
    return { action: "ignore", reason: "same-direction position already open (no pyramiding)" };
  }
  if (allowReverse) return { action: "reverse_then_open" };
  return { action: "ignore", reason: "opposite position open and ALLOW_REVERSE is off" };
}

// ---------------------------------------------------------------------------
// IP allowlist
// ---------------------------------------------------------------------------

/** True if the request IP is allowed. Empty allowlist = OFF (allow all). */
export function ipAllowed(allowlist: string[], ip: string | null | undefined): boolean {
  if (allowlist.length === 0) return true;
  if (!ip) return false;
  // x-forwarded-for can be "client, proxy1, proxy2" — match any hop.
  const hops = ip.split(",").map((s) => s.trim());
  return hops.some((h) => allowlist.includes(h));
}
