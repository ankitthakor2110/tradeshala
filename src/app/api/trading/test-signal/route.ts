import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_AUTO_CONFIG } from "@/lib/auto/config";
import {
  loadConfigRow,
  evaluateEntry,
  executePlan,
  recordDecision,
  type ConfigRow,
} from "@/services/auto-trade.server";
import type { NormalizedSignal } from "@/types/autoTrade";

// Test / simulation (spec sections 42–43): submit a sample signal without
// TradingView. Defaults to a DRY RUN (no trade). Set execute:true to actually
// place the paper trade. Session-gated; runs against the current user's account.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  if (!symbol) return Response.json({ error: "symbol is required" }, { status: 400 });

  const rawDir = String(body.direction ?? body.side ?? "BUY").trim().toUpperCase();
  const side: "long" | "short" = rawDir === "SELL" || rawDir === "SHORT" ? "short" : "long";
  const direction: "BUY" | "SELL" = side === "short" ? "SELL" : "BUY";

  const rawOpt = String(body.optionType ?? "").trim().toUpperCase();
  const optionType: "CALL" | "PUT" | null =
    rawOpt === "CE" || rawOpt === "CALL" ? "CALL" : rawOpt === "PE" || rawOpt === "PUT" ? "PUT" : null;

  const execute = body.execute === true;

  const signal: NormalizedSignal = {
    signalId: null,
    symbol,
    direction,
    event: "entry",
    side,
    optionType,
    price: Number(body.price) > 0 ? Number(body.price) : 0,
    strategy: String(body.strategy ?? "TEST"),
    timeframe: body.timeframe != null ? String(body.timeframe) : null,
    timestamp: new Date().toISOString(),
    source: "test",
  };

  const admin = createAdminClient();
  const cfg: ConfigRow =
    (await loadConfigRow(admin, user.id)) ?? { config: DEFAULT_AUTO_CONFIG, version: 0, emergencyStopped: false };

  try {
    // Preview forces a dry run; execute:true lets the real decision stand.
    const evaluation = await evaluateEntry(admin, user.id, signal, cfg, { forceDryRun: !execute });
    let decision = evaluation.decision;
    let orderId: string | undefined;
    let positionId: string | undefined;

    if (execute && decision.status === "EXECUTED") {
      const result = await executePlan(admin, user.id, signal, decision, evaluation.chainSource ?? "mock");
      decision = {
        ...decision,
        status: result.executed ? "EXECUTED" : "FAILED",
        reason: result.executed ? decision.reason : result.detail,
        audit: [...decision.audit, { step: "Execution", ok: result.executed, detail: result.detail }],
      };
      orderId = result.orderId;
      positionId = result.positionId;
    }

    const decisionId = await recordDecision(admin, user.id, signal, decision, {
      configVersion: cfg.version,
      raw: body,
      isAuto: false,
      orderId,
      positionId,
    });

    return Response.json({ ok: true, decisionId, decision, expiry: evaluation.expiry, executed: !!orderId });
  } catch (e) {
    return Response.json({ error: (e as Error).message ?? "Test failed" }, { status: 500 });
  }
}
