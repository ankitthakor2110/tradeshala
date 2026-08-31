import type {
  AutoTradeConfig,
  NormalizedSignal,
  Decision,
  AuditStep,
  StrikeCandidate,
  RiskCounters,
  TradePlan,
} from "@/types/autoTrade";
import { selectStrike } from "@/lib/auto/strike";
import { computeTarget, computeStopLoss, targetFromRR, computeTrailAmount, round2, type PosDir } from "@/lib/auto/targets";
import { computeQuantity } from "@/lib/auto/quantity";
import { checkDailyLimits, checkOpenPositions } from "@/lib/auto/risk";

// ============================================================================
// Decision pipeline (spec section 24) — PURE. Turns a normalized ENTRY signal +
// config + chain snapshot + counters into a Decision with a full audit trail.
// No DB/env/clock. The server does the I/O (loads chain/counters, executes) and
// calls this to decide; keeping it pure makes the whole flow unit-testable.
// ============================================================================

export interface PipelineContext {
  /** Contracts for the resolved side (CE or PE), one per strike. */
  candidates: StrikeCandidate[];
  atmStrike: number;
  strikeStep: number;
  expiry: string;
  lotSize: number;
  /** Data source of the chain — "mock" means fabricated prices/greeks. */
  chainSource: "dhan" | "upstox" | "mock";
  counters: RiskCounters;
  isDuplicate: boolean;
  sessionOk: boolean;
  emergencyStopped: boolean;
  /** Refuse execution when the chain resolved to mock prices (default true). */
  requireLive: boolean;
  /** test-signal / preview: force a non-executing DRY_RUN outcome. */
  forceDryRun?: boolean;
}

/** Resolve CE/PE from config + signal. Null when it can't be determined. */
export function resolveOptionType(config: AutoTradeConfig, signal: NormalizedSignal): "CE" | "PE" | null {
  const pref = config.instrument.optionType;
  if (pref === "CE") return "CE";
  if (pref === "PE") return "PE";
  // FOLLOW_SIGNAL: explicit option type wins, else derive from side.
  if (signal.optionType === "CALL") return "CE";
  if (signal.optionType === "PUT") return "PE";
  if (signal.side === "long") return "CE";
  if (signal.side === "short") return "PE";
  return null;
}

/** Entry premium from the chosen contract per config.entry.type. */
function resolveEntryPrice(
  config: AutoTradeConfig,
  signal: NormalizedSignal,
  contract: StrikeCandidate
): number {
  switch (config.entry.type) {
    case "SIGNAL":
      // The signal price is the UNDERLYING; only meaningful if the strategy sends
      // a premium. For options we still fall back to LTP if it looks like spot.
      return contract.ltp > 0 ? contract.ltp : signal.price;
    case "ASK":
      return contract.ask > 0 ? contract.ask : contract.ltp;
    case "BID":
      return contract.bid > 0 ? contract.bid : contract.ltp;
    case "CUSTOM":
      return config.entry.customPrice ?? 0;
    case "LTP":
    case "MARKET":
    default:
      return contract.ltp;
  }
}

const A = (step: string, ok: boolean, detail: string): AuditStep => ({ step, ok, detail });

/** Plan + decide an ENTRY signal. Pure. */
export function planEntry(config: AutoTradeConfig, signal: NormalizedSignal, ctx: PipelineContext): Decision {
  const audit: AuditStep[] = [];
  const mode = config.mode;
  const skip = (reason: string, plan: TradePlan | null = null): Decision => ({
    status: "SKIPPED",
    reason,
    mode,
    plan,
    audit,
    openAction: "ADD",
  });

  audit.push(A("Signal received", true, `${signal.symbol} ${signal.direction ?? signal.side ?? ""} @ ${signal.price}`));

  // --- Underlying filter ---
  const allow = config.instrument.allowedUnderlyings;
  if (allow.length > 0 && !allow.includes(signal.symbol.toUpperCase())) {
    audit.push(A("Underlying filter", false, `${signal.symbol} not in allowlist [${allow.join(", ")}]`));
    return skip(`Underlying ${signal.symbol} is not in the configured allowlist`);
  }
  audit.push(A("Underlying filter", true, allow.length ? `allowed (${allow.join(", ")})` : "any"));

  // --- Option type ---
  const optionType = resolveOptionType(config, signal);
  if (!optionType) {
    audit.push(A("Option type", false, "cannot determine CE/PE from signal or config"));
    return { status: "REJECTED", reason: "Cannot determine option type (CE/PE)", mode, plan: null, audit, openAction: "ADD" };
  }
  audit.push(A("Option type", true, optionType));

  // --- Duplicate ---
  if (config.duplicateProtection.enabled && ctx.isDuplicate) {
    audit.push(A("Duplicate check", false, "already processed within the dedupe window"));
    return { status: "DUPLICATE", reason: "Duplicate signal (already processed)", mode, plan: null, audit, openAction: "ADD" };
  }
  audit.push(A("Duplicate check", true, "unique"));

  // --- Strike selection ---
  const s = config.strikeSelection;
  const picked = selectStrike({
    method: s.method,
    optionType,
    candidates: ctx.candidates,
    atmStrike: ctx.atmStrike,
    strikeStep: ctx.strikeStep,
    targetDelta: s.targetDelta,
    maxDeltaDifference: s.maxDeltaDifference,
    fallback: s.fallback,
    offset: s.offset,
    itmOtmSteps: s.itmOtmSteps,
  });
  if (!picked.ok) {
    audit.push(A("Strike selection", false, picked.reason));
    return skip(picked.reason);
  }
  const contract = ctx.candidates.find((c) => c.strike === picked.strike)!;
  audit.push(
    A(
      "Strike selection",
      true,
      `${picked.strike} ${optionType} via ${picked.method}${picked.byDelta ? ` (Δ ${Math.abs(picked.delta).toFixed(2)})` : ""}`
    )
  );

  // --- Entry price ---
  const dir: PosDir = "long"; // options are bought-to-open → long the premium
  const entryPrice = round2(resolveEntryPrice(config, signal, contract));
  if (!(entryPrice > 0)) {
    audit.push(A("Entry price", false, "no valid entry price from the chain"));
    return { status: "FAILED", reason: "No valid entry price available", mode, plan: null, audit, openAction: "ADD" };
  }
  audit.push(A("Entry price", true, `₹${entryPrice} (${config.entry.type})`));

  // --- Stop loss then target (target may depend on the stop for RR) ---
  const stopLoss = computeStopLoss(entryPrice, dir, config.stopLoss.type, config.stopLoss.value);
  const target =
    config.target.type === "RR"
      ? targetFromRR(entryPrice, stopLoss, config.riskReward.risk, config.riskReward.reward, dir)
      : computeTarget(entryPrice, dir, config.target.type, config.target.value);
  audit.push(A("Target / stop", true, `tgt ₹${target} / sl ₹${stopLoss}`));

  // --- Quantity ---
  const { quantity, lots } = computeQuantity({
    mode: config.quantity.mode,
    lots: config.quantity.lots,
    fixedQty: config.quantity.fixedQty,
    riskAmount: config.quantity.riskAmount,
    lotSize: ctx.lotSize,
    stopDistance: Math.abs(entryPrice - stopLoss),
  });
  audit.push(A("Quantity", true, `${quantity} (${lots} lot${lots !== 1 ? "s" : ""} × ${ctx.lotSize})`));

  const trailAmount = config.trailingStop.enabled
    ? computeTrailAmount(entryPrice, config.trailingStop.type, config.trailingStop.value)
    : null;

  const plan: TradePlan = {
    symbol: signal.symbol.toUpperCase(),
    optionType,
    expiry: ctx.expiry,
    strike: picked.strike,
    delta: picked.byDelta ? round2(Math.abs(picked.delta)) : null,
    entryPrice,
    quantity,
    lots,
    lotSize: ctx.lotSize,
    target,
    stopLoss,
    targetType: config.target.type,
    stopLossType: config.stopLoss.type,
    trailAmount,
    beActivation: config.breakeven.enabled ? config.breakeven.activation : null,
    beOffset: config.breakeven.offset,
  };

  // ===================== Execution gates (plan is now attached) =====================

  if (ctx.emergencyStopped) {
    audit.push(A("Emergency stop", false, "auto trading is stopped"));
    return skip("Auto trading is stopped (emergency)", plan);
  }

  if (mode === "MANUAL") {
    audit.push(A("Mode", true, "Manual — recorded only"));
    return skip("Manual mode — signal recorded, no automatic trade", plan);
  }

  if (!config.enabled) {
    audit.push(A("Enabled", false, "automatic trading is disabled"));
    return skip("Automatic trading is disabled", plan);
  }
  audit.push(A("Enabled", true, "on"));

  if (config.session.enforce && !ctx.sessionOk) {
    audit.push(A("Session", false, `outside ${config.session.start}–${config.session.end}`));
    return skip(`Outside allowed trading window (${config.session.start}–${config.session.end})`, plan);
  }
  audit.push(A("Session", true, config.session.enforce ? "within window" : "not enforced"));

  const daily = checkDailyLimits(config, ctx.counters);
  if (!daily.ok) {
    audit.push(A("Daily limits", false, daily.reason));
    return skip(daily.reason, plan);
  }
  audit.push(
    A(
      "Daily limits",
      true,
      `trades ${ctx.counters.tradesToday}/${config.riskLimits.maxTradesPerDay}, P&L ₹${ctx.counters.realizedPnlToday.toFixed(0)}`
    )
  );

  const openCheck = checkOpenPositions(config, ctx.counters);
  if (!openCheck.ok) {
    audit.push(A("Open positions", false, openCheck.reason));
    return skip(openCheck.reason, plan);
  }
  const openAction: "ADD" | "REVERSE" = openCheck.action === "REVERSE" ? "REVERSE" : "ADD";
  audit.push(
    A("Open positions", true, `${ctx.counters.openPositions}/${config.riskLimits.maxOpenPositions} (${openAction})`)
  );

  // --- Mode routing ---
  // Dry-run and semi-auto proposals only PREVIEW — they never execute, so they
  // compute freely even on a mock chain (the live-pricing guard applies only to
  // real execution below, and again at execution time in the server).
  if (ctx.forceDryRun || config.dryRun) {
    audit.push(A("Dry run", true, "computed, not executed"));
    return { status: "DRY_RUN", reason: "Dry run — no trade executed", mode, plan, audit, openAction };
  }

  if (mode === "SEMI") {
    audit.push(A("Mode", true, "Semi-automatic — awaiting approval"));
    return { status: "PROPOSED", reason: "Proposed — awaiting approval", mode, plan, audit, openAction };
  }

  // --- AUTOMATIC execution — never book at fabricated premiums ---
  if (ctx.requireLive && ctx.chainSource === "mock") {
    audit.push(A("Live pricing", false, "option chain resolved to mock prices"));
    return skip("No live option pricing (source=mock); reconnect the broker or disable require-live", plan);
  }
  audit.push(A("Live pricing", true, ctx.chainSource));

  audit.push(A("Decision", true, "all checks passed — execute"));
  return { status: "EXECUTED", reason: "All checks passed", mode, plan, audit, openAction };
}
