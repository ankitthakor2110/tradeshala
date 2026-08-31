// ============================================================================
// Automatic Trade Taker — types
// ----------------------------------------------------------------------------
// The persisted per-account trading configuration, the normalized signal shape,
// and the decision result. All pure data; no DB/env/clock. The config JSON is
// stored in `trading_configs.config` and versioned in `trading_config_versions`;
// each processed signal produces an `auto_trade_decisions` row.
// ============================================================================

export type TradingMode = "MANUAL" | "SEMI" | "AUTOMATIC";
export type ProductType = "OPTIONS" | "FUTURES" | "EQUITY";
/** CE/PE for the option leg. FOLLOW_SIGNAL derives it from the signal side. */
export type OptionTypePref = "FOLLOW_SIGNAL" | "CE" | "PE";
export type ExpiryMode = "NEAREST" | "CURRENT" | "NEXT" | "WEEKLY" | "MONTHLY" | "SPECIFIC";
export type StrikeMethod = "ATM" | "ITM" | "OTM" | "OFFSET" | "DELTA";
export type StrikeFallback = "SKIP" | "CLOSEST";
export type EntryPriceType = "MARKET" | "SIGNAL" | "LTP" | "ASK" | "BID" | "CUSTOM";
export type QuantityMode = "LOTS" | "FIXED" | "RISK";
export type TargetType = "PERCENTAGE" | "POINTS" | "PRICE" | "RR";
export type StopLossType = "PERCENTAGE" | "POINTS" | "PRICE";
export type TrailType = "POINTS" | "PERCENTAGE";
/** What to do when an open position already exists for the account. */
export type ExistingPositionAction = "IGNORE" | "ADD" | "REVERSE";

export interface AutoTradeConfig {
  enabled: boolean;
  mode: TradingMode;
  /** Global safety: process everything but never open a real paper position. */
  dryRun: boolean;

  instrument: {
    product: ProductType;
    optionType: OptionTypePref;
    /** Only act on these underlyings; empty = follow the signal (any). */
    allowedUnderlyings: string[];
  };

  expiry: {
    mode: ExpiryMode;
    /** ISO date used only when mode === "SPECIFIC". */
    specific: string | null;
  };

  strikeSelection: {
    method: StrikeMethod;
    targetDelta: number;
    maxDeltaDifference: number;
    fallback: StrikeFallback;
    /** ATM offset in strike steps (signed) for OFFSET mode. */
    offset: number;
    /** Number of strikes ITM / OTM for ITM / OTM modes. */
    itmOtmSteps: number;
  };

  entry: {
    type: EntryPriceType;
    customPrice: number | null;
  };

  quantity: {
    mode: QuantityMode;
    lots: number;
    fixedQty: number;
    /** ₹ risk budget for RISK mode; sized against the per-unit stop distance. */
    riskAmount: number;
  };

  target: { type: TargetType; value: number };
  stopLoss: { type: StopLossType; value: number };
  /** Risk:reward — used when target.type === "RR" to derive the target from SL. */
  riskReward: { enabled: boolean; risk: number; reward: number };
  trailingStop: { enabled: boolean; type: TrailType; value: number; activation: number };
  breakeven: { enabled: boolean; activation: number; offset: number };

  riskLimits: {
    maxTradesPerDay: number;
    maxDailyLoss: number;
    maxConsecutiveLosses: number;
    maxOpenPositions: number;
  };

  existingPositionAction: ExistingPositionAction;
  duplicateProtection: { enabled: boolean };

  /** Market-session gate. When enforce is on, signals outside [start,end] IST are
   * recorded but not executed. */
  session: { enforce: boolean; start: string; end: string };
}

/** Canonical, normalized signal the pipeline reasons over (superset of the tv payload). */
export interface NormalizedSignal {
  signalId: string | null;
  symbol: string;
  /** BUY / SELL as seen on the wire (for display). */
  direction: "BUY" | "SELL" | null;
  /** entry / exit event. */
  event: "entry" | "exit";
  /** long / short for an entry. */
  side: "long" | "short" | null;
  optionType: "CALL" | "PUT" | null;
  price: number;
  strategy: string;
  timeframe: string | null;
  timestamp: string | null;
  source: string;
}

export type DecisionStatus =
  | "EXECUTED"
  | "SKIPPED"
  | "REJECTED"
  | "FAILED"
  | "DUPLICATE"
  | "PROPOSED"
  | "DRY_RUN";

/** One line of the human-readable audit trail attached to a decision. */
export interface AuditStep {
  step: string;
  ok: boolean;
  detail: string;
}

/** A single option contract candidate the strike selector reasons over. */
export interface StrikeCandidate {
  strike: number;
  delta: number;
  ltp: number;
  bid: number;
  ask: number;
}

/** The strike selector's outcome. */
export type StrikeResult =
  | {
      ok: true;
      strike: number;
      delta: number;
      /** How it was chosen (for the audit trail). */
      method: string;
      byDelta: boolean;
    }
  | { ok: false; reason: string };

/** Counters the risk manager evaluates against the configured limits. */
export interface RiskCounters {
  tradesToday: number;
  realizedPnlToday: number;
  consecutiveLosses: number;
  openPositions: number;
}

/** The computed trade parameters produced by the pipeline for an executable signal. */
export interface TradePlan {
  symbol: string;
  optionType: "CE" | "PE";
  expiry: string;
  strike: number;
  delta: number | null;
  entryPrice: number;
  quantity: number;
  lots: number;
  lotSize: number;
  target: number;
  stopLoss: number;
  targetType: TargetType;
  stopLossType: StopLossType;
  trailAmount: number | null;
  beActivation: number | null;
  beOffset: number;
}

/** The full decision the pipeline emits for one signal. */
export interface Decision {
  status: DecisionStatus;
  reason: string;
  mode: TradingMode;
  plan: TradePlan | null;
  audit: AuditStep[];
  /** When executing at the open-position cap, whether to ADD or REVERSE. */
  openAction: "ADD" | "REVERSE";
}
