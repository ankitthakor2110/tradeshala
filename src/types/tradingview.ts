// Types for the TradingView webhook paper-trading ledger. These tables are
// intentionally NOT in the `Database` schema (src/types/database.ts) — like
// `orders`/`positions` they're typed inline here and inserts are cast `as never`
// when written through the admin client.

export type TvSide = "long" | "short";
export type TvOptionType = "CALL" | "PUT";
export type TvExitReason = "tp" | "sl" | "manual" | "reverse";

export interface TvWebhookLog {
  id: string;
  received_at: string;
  content_type: string | null;
  source_ip: string | null;
  raw_body: string | null;
  parsed_json: unknown;
  dedupe_key: string | null;
  status: "received" | "processed" | "rejected";
  error: string | null;
}

export interface TvPosition {
  id: string;
  strategy: string;
  symbol: string;
  side: TvSide;
  option_type: TvOptionType | null;
  timeframe: string | null;
  entry_price: number;
  sl: number | null;
  tp: number | null;
  qty: number;
  opened_at: string;
  status: "open";
}

export interface TvTrade {
  id: string;
  strategy: string;
  symbol: string;
  side: TvSide;
  option_type: TvOptionType | null;
  entry_price: number;
  exit_price: number;
  qty: number;
  gross: number;
  cost: number;
  net: number;
  reason: TvExitReason;
  opened_at: string;
  closed_at: string;
  duration_seconds: number | null;
}

// Per-strategy and combined stats surfaced on the dashboard (Phase 2).
export interface TvStrategyStats {
  strategy: string; // "__combined__" for the all-strategies aggregate
  trades: number;
  wins: number;
  losses: number;
  winRate: number; // 0..100
  profitFactor: number; // grossProfit / grossLoss (Infinity if no losses)
  avgWin: number;
  avgLoss: number; // negative
  expectancy: number; // net per trade
  netPnl: number;
  maxDrawdown: number; // most negative peak-to-trough on the cumulative curve
}

export interface TvEquityPoint {
  closed_at: string;
  net: number;
  cumulative: number;
}
