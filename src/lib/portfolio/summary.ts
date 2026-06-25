// Pure calculations behind the Portfolio account-summary page. No React / DB /
// clock dependency (the period cutoff takes `now` as an argument), so they're
// deterministic and unit-tested in summary.test.ts.

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export type EquityPeriod = "1W" | "1M" | "3M" | "All";

export interface AllocationInput {
  instrument_type: string; // "EQ" | "CE" | "PE" | "FUT"
  current_value: number;
}

export interface ClosedTradeInput {
  closed_at: string | null;
  realized_pnl: number;
}

/** Account value = cash + mark-to-market value of open positions. */
export function accountValue(cash: number, openCurrentValue: number): number {
  return round2(cash + openCurrentValue);
}

/**
 * Capital split across asset classes (+ cash), by current value. Options = CE/PE
 * (anything that isn't EQ or FUT), matching the trade engine's instrument types.
 */
export function allocationBuckets(
  open: AllocationInput[],
  cash: number
): { cash: number; equity: number; options: number; futures: number } {
  let equity = 0;
  let options = 0;
  let futures = 0;
  for (const p of open) {
    if (p.instrument_type === "EQ") equity += p.current_value;
    else if (p.instrument_type === "FUT") futures += p.current_value;
    else options += p.current_value;
  }
  return { cash: round2(cash), equity: round2(equity), options: round2(options), futures: round2(futures) };
}

/**
 * Cumulative realized P&L over closed trades within the selected period, one
 * point per close-date, chronological. `now` is injected so the period cutoff is
 * testable. Returns ISO date keys; the page formats them for display.
 */
export function buildEquityCurve(
  closed: ClosedTradeInput[],
  period: EquityPeriod,
  now: Date
): { dateKey: string; cumulative: number }[] {
  const cutoff = new Date(now);
  if (period === "1W") cutoff.setDate(cutoff.getDate() - 7);
  else if (period === "1M") cutoff.setDate(cutoff.getDate() - 30);
  else if (period === "3M") cutoff.setDate(cutoff.getDate() - 90);
  else cutoff.setFullYear(cutoff.getFullYear() - 50); // "All"

  const byDay = new Map<string, number>();
  for (const p of closed) {
    if (!p.closed_at) continue;
    const d = new Date(p.closed_at);
    if (d < cutoff) continue;
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + (p.realized_pnl || 0));
  }

  let cum = 0;
  return Array.from(byDay.keys())
    .sort()
    .map((dateKey) => {
      cum = round2(cum + (byDay.get(dateKey) ?? 0));
      return { dateKey, cumulative: cum };
    });
}
