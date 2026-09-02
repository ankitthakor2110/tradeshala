import type { createAdminClient } from "@/lib/supabase/admin";
import type { OptionChainData } from "@/types/database";
import type { WebhookPayload } from "@/lib/tv/schema";
import type {
  AutoTradeConfig,
  NormalizedSignal,
  Decision,
  StrikeCandidate,
  RiskCounters,
} from "@/types/autoTrade";
import { mergeConfig } from "@/lib/auto/config";
import { planEntry } from "@/lib/auto/pipeline";
import { inferStrikeStep } from "@/lib/auto/strike";
import { istMinutesOfDay, withinSession } from "@/lib/auto/session";
import { getExpiries } from "@/lib/market-data/expiries";
import { fetchOptionChain } from "@/lib/market-data/option-chain";
import { TV_WEBHOOK_CONFIG } from "@/config/tradingview";
import {
  resolveTradeUserId,
  closeLinkedPosition,
  placeOptionBuyToOpen,
  type EngineResult,
  type OptionContractInfo,
} from "@/services/trade-engine.server";

// ============================================================================
// Config-driven Automatic Trade Taker (server side, PAPER trading only).
// ----------------------------------------------------------------------------
// The webhook route calls runAutoTrade AFTER the tv_* ledger has been updated.
// If the configured trade account has a trading_configs row, this owns execution
// (writes an auto_trade_decisions audit row and, when the decision is EXECUTED,
// places a real option paper-trade via placeOptionBuyToOpen). If there is NO
// config row it returns null so the caller falls back to the legacy env engine —
// existing deployments keep working unchanged.
//
// There is no broker client on this path. It only moves rows in Postgres and the
// virtual wallet, exactly like the manual simulator.
// ============================================================================

type Admin = ReturnType<typeof createAdminClient>;

export interface ConfigRow {
  config: AutoTradeConfig;
  version: number;
  emergencyStopped: boolean;
}

export interface RunResult {
  handled: boolean;
  decisionId?: string;
  status?: Decision["status"];
  detail?: string;
  /** The opened contract on an EXECUTED entry — for the Telegram alert. */
  contract?: OptionContractInfo;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Start of today's IST day as a UTC ISO string (for daily counters). */
function startOfIstDayUtc(): string {
  const istMs = Date.now() + 5.5 * 3600 * 1000;
  const ist = new Date(istMs);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600 * 1000).toISOString();
}

/** Load the active config for a user, or null if none is configured. */
export async function loadConfigRow(admin: Admin, userId: string): Promise<ConfigRow | null> {
  const { data } = await admin
    .from("trading_configs")
    .select("config, version, emergency_stopped")
    .eq("user_id", userId)
    .maybeSingle<{ config: unknown; version: number; emergency_stopped: boolean }>();
  if (!data) return null;
  return { config: mergeConfig(data.config), version: data.version, emergencyStopped: data.emergency_stopped };
}

/** Per-account counters the risk manager evaluates. Auto-trade specific.
 * `excludeDecisionId` omits the caller's own in-flight reservation from the
 * open-position count (see the concurrency note below). */
export async function loadCounters(
  admin: Admin,
  userId: string,
  opts: { excludeDecisionId?: string } = {}
): Promise<RiskCounters> {
  const since = startOfIstDayUtc();
  // In-flight reservations older than this are treated as abandoned (a crashed
  // mid-run) so a stale PROCESSING row can't block the account forever.
  const reservationFloor = new Date(Date.now() - 60_000).toISOString();

  const [{ count: tradesToday }, { count: openPositions }, inflight, closed] = await Promise.all([
    admin
      .from("auto_trade_decisions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "EXECUTED")
      .eq("is_auto", true)
      .gte("created_at", since),
    admin.from("tv_engine_positions").select("strategy", { count: "exact", head: true }).eq("user_id", userId),
    // Concurrency (spec section 36): count OTHER signals currently mid-processing
    // so two distinct signals arriving together don't both see 0 open positions
    // and both trade past a max-open limit. A signal reserves a PROCESSING row
    // BEFORE it opens its position, so this closes that window.
    admin
      .from("auto_trade_decisions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "PROCESSING")
      .gte("created_at", reservationFloor)
      .returns<{ id: string }[]>(),
    admin
      .from("auto_trade_decisions")
      .select("realized_pnl, updated_at")
      .eq("user_id", userId)
      .not("realized_pnl", "is", null)
      .order("updated_at", { ascending: false })
      .limit(50)
      .returns<{ realized_pnl: number; updated_at: string }[]>(),
  ]);

  const otherInflight = (inflight.data ?? []).filter((r) => r.id !== opts.excludeDecisionId).length;

  const rows = closed.data ?? [];
  const realizedPnlToday = rows
    .filter((r) => r.updated_at >= since)
    .reduce((s, r) => s + (r.realized_pnl ?? 0), 0);

  // Consecutive losses: leading run of losing closes (most recent first).
  let consecutiveLosses = 0;
  for (const r of rows) {
    if ((r.realized_pnl ?? 0) < 0) consecutiveLosses += 1;
    else break;
  }

  return {
    tradesToday: tradesToday ?? 0,
    realizedPnlToday: round2(realizedPnlToday),
    consecutiveLosses,
    openPositions: (openPositions ?? 0) + otherInflight,
  };
}

/** Pick the expiry per config.expiry.mode from the live expiry list. */
export function pickExpiry(expiries: string[], mode: AutoTradeConfig["expiry"]["mode"], specific: string | null): string | null {
  if (expiries.length === 0) return null;
  switch (mode) {
    case "NEXT":
      return expiries[1] ?? expiries[0];
    case "MONTHLY": {
      // Last expiry within the nearest expiry's calendar month.
      const first = new Date(expiries[0]);
      const ym = `${first.getUTCFullYear()}-${first.getUTCMonth()}`;
      const sameMonth = expiries.filter((e) => {
        const d = new Date(e);
        return `${d.getUTCFullYear()}-${d.getUTCMonth()}` === ym;
      });
      return sameMonth.length ? sameMonth[sameMonth.length - 1] : expiries[0];
    }
    case "SPECIFIC": {
      if (specific && expiries.includes(specific)) return specific;
      if (!specific) return expiries[0];
      // nearest by date
      const target = new Date(specific).getTime();
      return expiries.reduce((best, e) =>
        Math.abs(new Date(e).getTime() - target) < Math.abs(new Date(best).getTime() - target) ? e : best
      );
    }
    case "NEAREST":
    case "CURRENT":
    case "WEEKLY":
    default:
      return expiries[0];
  }
}

/** Normalize a validated webhook payload (+ raw) into the pipeline's signal shape. */
export function toNormalizedSignal(payload: WebhookPayload, raw: Record<string, unknown> | null): NormalizedSignal {
  const isEntry = payload.event === "entry";
  const rawAction = typeof raw?.action === "string" ? raw.action.trim().toUpperCase() : null;
  const side = isEntry ? payload.side : null;
  const direction: "BUY" | "SELL" | null =
    rawAction === "BUY" || rawAction === "SELL"
      ? rawAction
      : side === "long"
        ? "BUY"
        : side === "short"
          ? "SELL"
          : null;
  return {
    signalId: payload.id ?? null,
    symbol: payload.symbol.toUpperCase(),
    direction,
    event: payload.event,
    side,
    optionType: isEntry ? payload.option_type ?? null : null,
    price: payload.price,
    strategy: payload.strategy,
    timeframe: isEntry ? payload.timeframe ?? null : null,
    timestamp: payload.time ?? null,
    source: "tradingview",
  };
}

export interface Evaluation {
  decision: Decision;
  expiry: string | null;
  chainSource: "dhan" | "upstox" | "mock" | null;
}

/**
 * Evaluate an ENTRY signal end-to-end (loads chain + counters, then planEntry).
 * No writes. `forceDryRun` makes the outcome a non-executing DRY_RUN (test mode).
 */
export async function evaluateEntry(
  admin: Admin,
  userId: string,
  signal: NormalizedSignal,
  cfg: ConfigRow,
  opts: { forceDryRun?: boolean; reservationId?: string } = {}
): Promise<Evaluation> {
  const config = cfg.config;

  // Resolve option type early so we can fetch the right side of the chain.
  const optionType =
    config.instrument.optionType === "CE"
      ? "CE"
      : config.instrument.optionType === "PE"
        ? "PE"
        : signal.optionType === "CALL"
          ? "CE"
          : signal.optionType === "PUT"
            ? "PE"
            : signal.side === "long"
              ? "CE"
              : signal.side === "short"
                ? "PE"
                : null;

  const counters = await loadCounters(admin, userId, { excludeDecisionId: opts.reservationId });
  const sigTime = signal.timestamp ? new Date(signal.timestamp) : new Date();
  const sessionOk = withinSession(istMinutesOfDay(sigTime), config.session.start, config.session.end);

  // Resolve expiry + chain.
  const { expiries } = await getExpiries(signal.symbol);
  const expiry = pickExpiry(expiries, config.expiry.mode, config.expiry.specific);
  if (!expiry || !optionType) {
    const decision = planEntry(config, signal, {
      candidates: [],
      atmStrike: 0,
      strikeStep: 0,
      expiry: expiry ?? "",
      lotSize: 1,
      chainSource: "mock",
      counters,
      isDuplicate: false,
      sessionOk,
      emergencyStopped: cfg.emergencyStopped,
      requireLive: TV_WEBHOOK_CONFIG.engineRequireLive,
      forceDryRun: opts.forceDryRun,
    });
    return { decision, expiry, chainSource: null };
  }

  const chain = await fetchOptionChain(signal.symbol, expiry);
  const leg = (r: OptionChainData) => (optionType === "CE" ? r.ce : r.pe);
  const candidates: StrikeCandidate[] = chain.chain.map((r) => ({
    strike: r.strike_price,
    delta: leg(r).delta,
    ltp: leg(r).ltp,
    bid: leg(r).bid,
    ask: leg(r).ask,
  }));
  const strikeStep = inferStrikeStep(chain.chain.map((r) => r.strike_price));
  const lotSize = chain.lotSize ?? 1;

  const decision = planEntry(config, signal, {
    candidates,
    atmStrike: chain.atmStrike,
    strikeStep,
    expiry,
    lotSize,
    chainSource: chain.source,
    counters,
    isDuplicate: false,
    sessionOk,
    emergencyStopped: cfg.emergencyStopped,
    requireLive: TV_WEBHOOK_CONFIG.engineRequireLive,
    forceDryRun: opts.forceDryRun,
  });

  return { decision, expiry, chainSource: chain.source };
}

/** Actually place the paper trade for an approved plan. */
export async function executePlan(
  admin: Admin,
  userId: string,
  signal: NormalizedSignal,
  decision: Decision,
  chainSource: string
): Promise<EngineResult> {
  const plan = decision.plan;
  if (!plan) return { executed: false, detail: "no plan to execute" };

  // Never book a real fill at fabricated (mock) premiums. This guards the
  // approve path too, where planEntry classified the signal as PROPOSED without
  // running the AUTOMATIC-only live-pricing check.
  if (TV_WEBHOOK_CONFIG.engineRequireLive && chainSource === "mock") {
    return { executed: false, detail: "skipped — no live option pricing (source=mock); position not opened" };
  }

  // Reverse: close the existing linked contract before opening the new one.
  if (decision.openAction === "REVERSE") {
    await closeLinkedPosition(admin, userId, signal.strategy, signal.symbol);
  }

  return placeOptionBuyToOpen(admin, userId, {
    strategy: signal.strategy,
    symbol: plan.symbol,
    optionType: plan.optionType,
    expiry: plan.expiry,
    strike: plan.strike,
    premium: plan.entryPrice,
    source: chainSource,
    quantity: plan.quantity,
    lotSize: plan.lotSize,
    target: plan.target,
    stopLoss: plan.stopLoss,
    trailAmount: plan.trailAmount,
    beActivation: plan.beActivation,
    beOffset: plan.beOffset,
    strikeNote: plan.delta != null ? `Δ ${plan.delta}` : plan.targetType,
    note: `Auto (${decision.mode}): ${signal.strategy}`,
  });
}

/** Build the decision-row payload from a normalized signal + decision. */
function decisionRow(
  userId: string,
  signal: NormalizedSignal,
  decision: Decision,
  extras: {
    webhookLogId: string | null;
    dedupeKey: string | null;
    configVersion: number;
    raw: unknown;
    dryRun: boolean;
    isAuto: boolean;
  }
): Record<string, unknown> {
  const plan = decision.plan;
  return {
    user_id: userId,
    webhook_log_id: extras.webhookLogId,
    dedupe_key: extras.dedupeKey,
    status: decision.status,
    reason: decision.reason,
    mode: decision.mode,
    symbol: signal.symbol,
    direction: signal.direction,
    option_type: plan?.optionType ?? (signal.optionType === "PUT" ? "PE" : signal.optionType === "CALL" ? "CE" : null),
    side: signal.side,
    strategy: signal.strategy,
    timeframe: signal.timeframe,
    signal_price: signal.price,
    signal_time: signal.timestamp,
    strike: plan?.strike ?? null,
    expiry: plan?.expiry ?? null,
    delta: plan?.delta ?? null,
    entry_price: plan?.entryPrice ?? null,
    quantity: plan?.quantity ?? null,
    lot_size: plan?.lotSize ?? null,
    target: plan?.target ?? null,
    stop_loss: plan?.stopLoss ?? null,
    target_type: plan?.targetType ?? null,
    stop_loss_type: plan?.stopLossType ?? null,
    open_action: decision.openAction,
    config_version: extras.configVersion,
    audit_trail: decision.audit,
    normalized_signal: signal,
    raw_payload: extras.raw,
    is_auto: extras.isAuto,
    dry_run: extras.dryRun,
  };
}

/** Insert a standalone decision row (test-signal / approve flows). Returns id. */
export async function recordDecision(
  admin: Admin,
  userId: string,
  signal: NormalizedSignal,
  decision: Decision,
  opts: {
    configVersion: number;
    raw: unknown;
    isAuto: boolean;
    orderId?: string;
    positionId?: string;
    realizedPnl?: number | null;
  }
): Promise<string | null> {
  const row = {
    ...decisionRow(userId, signal, decision, {
      webhookLogId: null,
      dedupeKey: null, // standalone rows never participate in idempotency
      configVersion: opts.configVersion,
      raw: opts.raw,
      dryRun: decision.status === "DRY_RUN",
      isAuto: opts.isAuto,
    }),
    order_id: opts.orderId ?? null,
    position_id: opts.positionId ?? null,
    realized_pnl: opts.realizedPnl ?? null,
  };
  const { data } = await admin.from("auto_trade_decisions").insert(row as never).select("id").single<{ id: string }>();
  return data?.id ?? null;
}

/**
 * Main entry — process one webhook signal against the configured account.
 * Returns { handled:false } when there is no DB config (caller uses the legacy
 * env engine). Never throws — the caller's webhook must not fail on our behalf.
 */
export async function runAutoTrade(
  admin: Admin,
  input: {
    payload: WebhookPayload;
    raw: Record<string, unknown> | null;
    webhookLogId: string | null;
    dedupeKey: string | null;
  }
): Promise<RunResult> {
  const userId = await resolveTradeUserId(admin);
  if (!userId) return { handled: false, detail: "no trade account resolved" };

  const cfg = await loadConfigRow(admin, userId);
  if (!cfg) return { handled: false, detail: "no trading_configs row — legacy path" };

  const signal = toNormalizedSignal(input.payload, input.raw);

  // ---------------- EXIT ----------------
  if (signal.event === "exit") {
    const result = await closeLinkedPosition(admin, userId, signal.strategy, signal.symbol);
    const status: Decision["status"] = result.executed ? "EXECUTED" : "SKIPPED";
    const decision: Decision = {
      status,
      reason: result.detail,
      mode: cfg.config.mode,
      plan: null,
      audit: [{ step: "Exit", ok: result.executed, detail: result.detail }],
      openAction: "ADD",
    };
    const { data } = await admin
      .from("auto_trade_decisions")
      .insert({
        ...decisionRow(userId, signal, decision, {
          webhookLogId: input.webhookLogId,
          dedupeKey: null, // exits don't reserve — many exits may share a key
          configVersion: cfg.version,
          raw: input.raw,
          dryRun: false,
          isAuto: true,
        }),
        realized_pnl: result.realizedPnl ?? null,
        position_id: result.positionId ?? null,
        order_id: result.orderId ?? null,
      } as never)
      .select("id")
      .single<{ id: string }>();
    return { handled: true, decisionId: data?.id, status, detail: result.detail };
  }

  // ---------------- ENTRY ----------------
  // Reservation: every entry inserts a PROCESSING row up front. When duplicate
  // protection is on it carries the dedupe_key, so a duplicate/concurrent
  // identical signal loses the unique-index race and is recorded DUPLICATE
  // (idempotency, spec section 34). The in-flight PROCESSING row is also counted
  // toward open positions by loadCounters, so two DISTINCT concurrent signals
  // can't both trade past a max-open limit (concurrency, section 36).
  const protect = cfg.config.duplicateProtection.enabled;
  const { data: reserved, error: reserveErr } = await admin
    .from("auto_trade_decisions")
    .insert({
      user_id: userId,
      webhook_log_id: input.webhookLogId,
      dedupe_key: protect ? input.dedupeKey : null,
      status: "PROCESSING",
      mode: cfg.config.mode,
      symbol: signal.symbol,
      strategy: signal.strategy,
      config_version: cfg.version,
      raw_payload: input.raw,
      normalized_signal: signal,
      is_auto: true,
    } as never)
    .select("id")
    .single<{ id: string }>();
  if (reserveErr || !reserved) {
    // With protection on this is the unique-violation → already processed.
    if (protect && input.dedupeKey) {
      return { handled: true, status: "DUPLICATE", detail: "duplicate signal (reservation exists)" };
    }
    return { handled: true, status: "FAILED", detail: `reservation failed: ${reserveErr?.message ?? "unknown"}` };
  }
  const reservedId: string | null = reserved.id;
  // The key the reserved row already holds — finalize re-writes exactly this so
  // the idempotency key survives and the unique index is never tripped.
  const fin = { raw: input.raw, webhookLogId: input.webhookLogId, dedupeKey: protect ? input.dedupeKey : null };

  let evaluation: Evaluation;
  try {
    evaluation = await evaluateEntry(admin, userId, signal, cfg, { reservationId: reservedId ?? undefined });
  } catch (e) {
    const detail = `evaluation failed: ${(e as Error).message}`;
    const decision: Decision = {
      status: "FAILED",
      reason: detail,
      mode: cfg.config.mode,
      plan: null,
      audit: [{ step: "Evaluation", ok: false, detail }],
      openAction: "ADD",
    };
    await finalize(admin, reservedId, userId, signal, decision, fin, cfg.version);
    return { handled: true, decisionId: reservedId ?? undefined, status: "FAILED", detail };
  }

  let decision = evaluation.decision;

  // Execute when the pipeline approved it.
  if (decision.status === "EXECUTED") {
    const result = await executePlan(admin, userId, signal, decision, evaluation.chainSource ?? "mock");
    if (!result.executed) {
      decision = {
        ...decision,
        status: "FAILED",
        reason: result.detail,
        audit: [...decision.audit, { step: "Execution", ok: false, detail: result.detail }],
      };
    } else {
      decision = {
        ...decision,
        audit: [...decision.audit, { step: "Execution", ok: true, detail: result.detail }],
      };
    }
    await finalize(admin, reservedId, userId, signal, decision, fin, cfg.version, {
      orderId: result.orderId,
      positionId: result.positionId,
    });
    return {
      handled: true,
      decisionId: reservedId ?? undefined,
      status: decision.status,
      detail: result.detail,
      contract: result.contract,
    };
  }

  // Non-executing outcomes (SKIPPED / PROPOSED / DRY_RUN / REJECTED / DUPLICATE).
  await finalize(admin, reservedId, userId, signal, decision, fin, cfg.version);
  return { handled: true, decisionId: reservedId ?? undefined, status: decision.status, detail: decision.reason };
}

/** Write (or update the reserved) decision row to its final state. `dedupeKey` is
 * the exact value the reserved row already holds (protect ? key : null) so the
 * update leaves the idempotency key intact and never trips the unique index. */
async function finalize(
  admin: Admin,
  reservedId: string | null,
  userId: string,
  signal: NormalizedSignal,
  decision: Decision,
  input: { raw: Record<string, unknown> | null; webhookLogId: string | null; dedupeKey: string | null },
  configVersion: number,
  links: { orderId?: string; positionId?: string } = {}
): Promise<void> {
  const row = {
    ...decisionRow(userId, signal, decision, {
      webhookLogId: input.webhookLogId,
      dedupeKey: input.dedupeKey,
      configVersion,
      raw: input.raw,
      dryRun: decision.status === "DRY_RUN",
      isAuto: true,
    }),
    order_id: links.orderId ?? null,
    position_id: links.positionId ?? null,
  };
  if (reservedId) {
    await admin.from("auto_trade_decisions").update(row as never).eq("id", reservedId);
  } else {
    await admin.from("auto_trade_decisions").insert(row as never);
  }
}
