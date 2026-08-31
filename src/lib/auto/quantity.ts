import type { QuantityMode } from "@/types/autoTrade";

// ============================================================================
// Quantity sizing (spec section 14). Pure. Uses the actual lot size supplied by
// the caller (from the instrument master) — never a hardcoded NIFTY lot.
// ============================================================================

export interface QuantityInput {
  mode: QuantityMode;
  lots: number;
  fixedQty: number;
  riskAmount: number;
  lotSize: number;
  /** Per-unit stop distance (|entry - stop| premium points) — for RISK mode. */
  stopDistance: number;
}

export interface QuantityResult {
  quantity: number;
  lots: number;
}

/**
 * Compute the order quantity.
 *   LOTS:  quantity = lots × lotSize
 *   FIXED: quantity = round(fixedQty down to a whole lot multiple), min one lot
 *   RISK:  units = floor(riskAmount / stopDistance), rounded DOWN to a whole lot,
 *          min one lot (a paper trade always takes at least one lot).
 * Quantity is always a whole multiple of the lot size for derivatives.
 */
export function computeQuantity(input: QuantityInput): QuantityResult {
  const lotSize = Math.max(1, Math.round(input.lotSize));

  if (input.mode === "FIXED") {
    const wantLots = Math.max(1, Math.floor(input.fixedQty / lotSize));
    return { quantity: wantLots * lotSize, lots: wantLots };
  }

  if (input.mode === "RISK") {
    const risk = input.stopDistance > 0 ? input.stopDistance : 0;
    const rawUnits = risk > 0 ? Math.floor(input.riskAmount / risk) : lotSize;
    const wantLots = Math.max(1, Math.floor(rawUnits / lotSize));
    return { quantity: wantLots * lotSize, lots: wantLots };
  }

  // LOTS (default)
  const lots = Math.max(1, Math.round(input.lots));
  return { quantity: lots * lotSize, lots };
}
