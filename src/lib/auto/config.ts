import type { AutoTradeConfig } from "@/types/autoTrade";

// ============================================================================
// Auto-trade configuration: defaults, validation, and safe merge.
// Pure — no DB/env/clock. The DB stores the config as JSON; this module owns the
// canonical default and the validation rules (section 28 of the spec).
// ============================================================================

/** The default configuration for a fresh account. Mirrors the spec's example
 * (section 54): delta 0.60, 1 lot, target 30%, SL 15%, max 5 trades / 1 open. */
export const DEFAULT_AUTO_CONFIG: AutoTradeConfig = {
  enabled: false,
  mode: "MANUAL",
  dryRun: false,

  instrument: {
    product: "OPTIONS",
    optionType: "FOLLOW_SIGNAL",
    allowedUnderlyings: [],
  },

  expiry: { mode: "NEAREST", specific: null },

  strikeSelection: {
    method: "DELTA",
    targetDelta: 0.6,
    maxDeltaDifference: 0.05,
    fallback: "SKIP",
    offset: 0,
    itmOtmSteps: 1,
  },

  entry: { type: "MARKET", customPrice: null },

  quantity: { mode: "LOTS", lots: 1, fixedQty: 75, riskAmount: 5000 },

  target: { type: "PERCENTAGE", value: 30 },
  stopLoss: { type: "PERCENTAGE", value: 15 },
  riskReward: { enabled: false, risk: 1, reward: 2 },
  trailingStop: { enabled: false, type: "POINTS", value: 10, activation: 20 },
  breakeven: { enabled: false, activation: 15, offset: 0 },

  riskLimits: {
    maxTradesPerDay: 5,
    maxDailyLoss: 5000,
    maxConsecutiveLosses: 3,
    maxOpenPositions: 1,
  },

  existingPositionAction: "IGNORE",
  duplicateProtection: { enabled: true },

  session: { enforce: true, start: "09:15", end: "15:30" },
};

/** Deep-merge a stored (possibly partial / older) config over the defaults so new
 * keys always exist and old rows keep working. */
export function mergeConfig(stored: unknown): AutoTradeConfig {
  const d = DEFAULT_AUTO_CONFIG;
  if (!stored || typeof stored !== "object") return structuredCloneConfig(d);
  const s = stored as Record<string, unknown>;
  const obj = (k: string): Record<string, unknown> =>
    s[k] && typeof s[k] === "object" ? (s[k] as Record<string, unknown>) : {};

  const pick = <T>(v: unknown, fallback: T): T => (v === undefined || v === null ? fallback : (v as T));

  const inst = obj("instrument");
  const exp = obj("expiry");
  const strike = obj("strikeSelection");
  const entry = obj("entry");
  const qty = obj("quantity");
  const tgt = obj("target");
  const sl = obj("stopLoss");
  const rr = obj("riskReward");
  const trail = obj("trailingStop");
  const be = obj("breakeven");
  const limits = obj("riskLimits");
  const dup = obj("duplicateProtection");
  const sess = obj("session");

  return {
    enabled: pick(s.enabled, d.enabled),
    mode: pick(s.mode, d.mode),
    dryRun: pick(s.dryRun, d.dryRun),
    instrument: {
      product: pick(inst.product, d.instrument.product),
      optionType: pick(inst.optionType, d.instrument.optionType),
      allowedUnderlyings: Array.isArray(inst.allowedUnderlyings)
        ? (inst.allowedUnderlyings as string[])
        : d.instrument.allowedUnderlyings,
    },
    expiry: { mode: pick(exp.mode, d.expiry.mode), specific: pick(exp.specific, d.expiry.specific) },
    strikeSelection: {
      method: pick(strike.method, d.strikeSelection.method),
      targetDelta: pick(strike.targetDelta, d.strikeSelection.targetDelta),
      maxDeltaDifference: pick(strike.maxDeltaDifference, d.strikeSelection.maxDeltaDifference),
      fallback: pick(strike.fallback, d.strikeSelection.fallback),
      offset: pick(strike.offset, d.strikeSelection.offset),
      itmOtmSteps: pick(strike.itmOtmSteps, d.strikeSelection.itmOtmSteps),
    },
    entry: { type: pick(entry.type, d.entry.type), customPrice: pick(entry.customPrice, d.entry.customPrice) },
    quantity: {
      mode: pick(qty.mode, d.quantity.mode),
      lots: pick(qty.lots, d.quantity.lots),
      fixedQty: pick(qty.fixedQty, d.quantity.fixedQty),
      riskAmount: pick(qty.riskAmount, d.quantity.riskAmount),
    },
    target: { type: pick(tgt.type, d.target.type), value: pick(tgt.value, d.target.value) },
    stopLoss: { type: pick(sl.type, d.stopLoss.type), value: pick(sl.value, d.stopLoss.value) },
    riskReward: {
      enabled: pick(rr.enabled, d.riskReward.enabled),
      risk: pick(rr.risk, d.riskReward.risk),
      reward: pick(rr.reward, d.riskReward.reward),
    },
    trailingStop: {
      enabled: pick(trail.enabled, d.trailingStop.enabled),
      type: pick(trail.type, d.trailingStop.type),
      value: pick(trail.value, d.trailingStop.value),
      activation: pick(trail.activation, d.trailingStop.activation),
    },
    breakeven: {
      enabled: pick(be.enabled, d.breakeven.enabled),
      activation: pick(be.activation, d.breakeven.activation),
      offset: pick(be.offset, d.breakeven.offset),
    },
    riskLimits: {
      maxTradesPerDay: pick(limits.maxTradesPerDay, d.riskLimits.maxTradesPerDay),
      maxDailyLoss: pick(limits.maxDailyLoss, d.riskLimits.maxDailyLoss),
      maxConsecutiveLosses: pick(limits.maxConsecutiveLosses, d.riskLimits.maxConsecutiveLosses),
      maxOpenPositions: pick(limits.maxOpenPositions, d.riskLimits.maxOpenPositions),
    },
    existingPositionAction: pick(s.existingPositionAction, d.existingPositionAction),
    duplicateProtection: { enabled: pick(dup.enabled, d.duplicateProtection.enabled) },
    session: {
      enforce: pick(sess.enforce, d.session.enforce),
      start: pick(sess.start, d.session.start),
      end: pick(sess.end, d.session.end),
    },
  };
}

function structuredCloneConfig(c: AutoTradeConfig): AutoTradeConfig {
  return JSON.parse(JSON.stringify(c)) as AutoTradeConfig;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Validate a config; returns the list of human-readable errors ([] when valid).
 * Enforces the invariants in spec section 28. */
export function validateConfig(c: AutoTradeConfig): string[] {
  const errors: string[] = [];
  const modes = ["MANUAL", "SEMI", "AUTOMATIC"];
  if (!modes.includes(c.mode)) errors.push("Trading mode must be Manual, Semi-Automatic or Automatic.");

  const s = c.strikeSelection;
  if (s.method === "DELTA") {
    if (!(s.targetDelta > 0 && s.targetDelta < 1)) errors.push("Target delta must be between 0 and 1.");
    if (!(s.maxDeltaDifference >= 0)) errors.push("Maximum delta difference must be ≥ 0.");
  }
  if (s.method === "OFFSET" && !Number.isInteger(s.offset)) errors.push("Strike offset must be a whole number.");
  if ((s.method === "ITM" || s.method === "OTM") && !(s.itmOtmSteps >= 1))
    errors.push("ITM/OTM steps must be ≥ 1.");

  if (c.entry.type === "CUSTOM" && !(c.entry.customPrice != null && c.entry.customPrice > 0))
    errors.push("Custom entry price must be greater than 0.");

  const q = c.quantity;
  if (q.mode === "LOTS" && !(q.lots >= 1)) errors.push("Lots must be ≥ 1.");
  if (q.mode === "FIXED" && !(q.fixedQty >= 1)) errors.push("Fixed quantity must be ≥ 1.");
  if (q.mode === "RISK" && !(q.riskAmount > 0)) errors.push("Risk amount must be greater than 0.");

  if (c.target.type !== "RR" && !(c.target.value > 0)) errors.push("Target must be greater than 0.");
  if (!(c.stopLoss.value > 0)) errors.push("Stop loss must be greater than 0.");

  if (c.target.type === "RR" || c.riskReward.enabled) {
    if (!(c.riskReward.risk > 0)) errors.push("Risk (in the risk:reward ratio) must be greater than 0.");
    if (!(c.riskReward.reward > 0)) errors.push("Reward (in the risk:reward ratio) must be greater than 0.");
  }

  if (c.trailingStop.enabled) {
    if (!(c.trailingStop.value > 0)) errors.push("Trailing-stop amount must be greater than 0.");
    if (!(c.trailingStop.activation >= 0)) errors.push("Trailing-stop activation must be ≥ 0.");
  }
  if (c.breakeven.enabled && !(c.breakeven.activation > 0))
    errors.push("Breakeven activation must be greater than 0.");

  const rl = c.riskLimits;
  if (!(rl.maxTradesPerDay >= 1)) errors.push("Maximum trades per day must be ≥ 1.");
  if (!(rl.maxDailyLoss >= 0)) errors.push("Maximum daily loss must be ≥ 0.");
  if (!(rl.maxConsecutiveLosses >= 1)) errors.push("Maximum consecutive losses must be ≥ 1.");
  if (!(rl.maxOpenPositions >= 1)) errors.push("Maximum open positions must be ≥ 1.");

  if (c.session.enforce) {
    if (!HHMM.test(c.session.start)) errors.push("Session start must be HH:MM (24-hour).");
    if (!HHMM.test(c.session.end)) errors.push("Session end must be HH:MM (24-hour).");
  }

  return errors;
}
