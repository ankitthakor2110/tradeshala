import type { TvTrade, TvStrategyStats, TvEquityPoint } from "@/types/tradingview";
import { round2 } from "@/lib/tv/engine";

// Pure performance stats over the closed-trade ledger. No DB/clock — unit-tested
// in stats.test.ts. The dashboard computes these client-side from tv_trades.

const COMBINED = "__combined__";

/** Closed trades sorted chronologically (oldest first) by closed_at. */
function chronological(trades: TvTrade[]): TvTrade[] {
  return [...trades].sort((a, b) => Date.parse(a.closed_at) - Date.parse(b.closed_at));
}

/**
 * Most negative peak-to-trough excursion of the cumulative net-P&L curve, walked
 * chronologically. Returns <= 0 (0 if the curve never dips below a prior peak).
 */
export function maxDrawdown(trades: TvTrade[]): number {
  let cum = 0;
  let peak = 0;
  let dd = 0;
  for (const t of chronological(trades)) {
    cum += t.net;
    peak = Math.max(peak, cum);
    dd = Math.min(dd, cum - peak);
  }
  return round2(dd);
}

/** Stats for one set of trades, labelled with `strategy`. */
export function statsFor(strategy: string, trades: TvTrade[]): TvStrategyStats {
  const n = trades.length;
  const wins = trades.filter((t) => t.net > 0);
  const losses = trades.filter((t) => t.net < 0);
  const grossProfit = wins.reduce((s, t) => s + t.net, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.net, 0));
  const netPnl = trades.reduce((s, t) => s + t.net, 0);

  return {
    strategy,
    trades: n,
    wins: wins.length,
    losses: losses.length,
    winRate: n ? round2((wins.length / n) * 100) : 0,
    // Infinity when there are profits but zero losses; 0 when there's nothing.
    profitFactor: grossLoss > 0 ? round2(grossProfit / grossLoss) : grossProfit > 0 ? Infinity : 0,
    avgWin: wins.length ? round2(grossProfit / wins.length) : 0,
    avgLoss: losses.length ? round2(-grossLoss / losses.length) : 0,
    expectancy: n ? round2(netPnl / n) : 0,
    netPnl: round2(netPnl),
    maxDrawdown: maxDrawdown(trades),
  };
}

/**
 * Combined stats first (strategy = "__combined__"), then one entry per distinct
 * strategy, sorted by net P&L descending.
 */
export function computeAllStats(trades: TvTrade[]): TvStrategyStats[] {
  const byStrategy = new Map<string, TvTrade[]>();
  for (const t of trades) {
    const arr = byStrategy.get(t.strategy) ?? [];
    arr.push(t);
    byStrategy.set(t.strategy, arr);
  }
  const perStrategy = Array.from(byStrategy.entries())
    .map(([strategy, list]) => statsFor(strategy, list))
    .sort((a, b) => b.netPnl - a.netPnl);
  return [statsFor(COMBINED, trades), ...perStrategy];
}

/** Cumulative net-P&L curve over time. `strategy` null/omitted = all strategies. */
export function equityCurve(trades: TvTrade[], strategy?: string | null): TvEquityPoint[] {
  const filtered =
    strategy && strategy !== COMBINED ? trades.filter((t) => t.strategy === strategy) : trades;
  let cumulative = 0;
  return chronological(filtered).map((t) => {
    cumulative = round2(cumulative + t.net);
    return { closed_at: t.closed_at, net: t.net, cumulative };
  });
}

export const COMBINED_KEY = COMBINED;
