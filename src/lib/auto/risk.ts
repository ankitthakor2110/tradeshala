import type { AutoTradeConfig, RiskCounters, ExistingPositionAction } from "@/types/autoTrade";

// ============================================================================
// Risk manager (spec sections 20–21). Pure — evaluates the configured daily
// limits and open-position rules against the current counters. The caller reads
// the counters from the DB; this module only decides.
// ============================================================================

export type RiskVerdict =
  | { ok: true }
  | { ok: false; reason: string };

/** Daily-limit checks that halt automation for the day (max trades / daily loss /
 * consecutive losses). Loss counters are negative-or-zero realized P&L. */
export function checkDailyLimits(config: AutoTradeConfig, counters: RiskCounters): RiskVerdict {
  const rl = config.riskLimits;

  if (counters.tradesToday >= rl.maxTradesPerDay) {
    return { ok: false, reason: `Maximum trades per day reached (${counters.tradesToday}/${rl.maxTradesPerDay})` };
  }

  // realizedPnlToday is signed; a loss is negative. Halt when the loss meets/exceeds the cap.
  if (rl.maxDailyLoss > 0 && counters.realizedPnlToday <= -rl.maxDailyLoss) {
    return { ok: false, reason: `Maximum daily loss reached (₹${Math.abs(counters.realizedPnlToday).toFixed(0)} ≥ ₹${rl.maxDailyLoss})` };
  }

  if (counters.consecutiveLosses >= rl.maxConsecutiveLosses) {
    return {
      ok: false,
      reason: `Maximum consecutive losses reached (${counters.consecutiveLosses}/${rl.maxConsecutiveLosses})`,
    };
  }

  return { ok: true };
}

/** Open-position check (spec section 21). When at the cap, the configured
 * existingPositionAction decides: IGNORE the signal, ADD anyway, or REVERSE. */
export function checkOpenPositions(
  config: AutoTradeConfig,
  counters: RiskCounters
): { ok: true; action: ExistingPositionAction } | { ok: false; reason: string } {
  const cap = config.riskLimits.maxOpenPositions;
  if (counters.openPositions < cap) return { ok: true, action: "ADD" };

  // At or above the cap — defer to the configured behavior.
  switch (config.existingPositionAction) {
    case "ADD":
      return { ok: true, action: "ADD" };
    case "REVERSE":
      return { ok: true, action: "REVERSE" };
    case "IGNORE":
    default:
      return {
        ok: false,
        reason: `Maximum open positions reached (${counters.openPositions}/${cap}); existing-position action is Ignore`,
      };
  }
}
