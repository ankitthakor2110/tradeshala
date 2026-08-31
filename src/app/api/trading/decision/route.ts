import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadConfigRow, evaluateEntry, executePlan } from "@/services/auto-trade.server";
import type { NormalizedSignal } from "@/types/autoTrade";

// Semi-automatic approve / reject (spec section 2). A PROPOSED decision is
// approved (re-priced + executed now) or rejected (marked CANCELLED). Session-
// gated; the caller must own the decision row.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = body.id;
  const action = (body.action ?? "").toLowerCase();
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  if (action !== "approve" && action !== "reject")
    return Response.json({ error: "action must be approve or reject" }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("auto_trade_decisions")
    .select("id, user_id, status, normalized_signal, config_version")
    .eq("id", id)
    .maybeSingle<{ id: string; user_id: string; status: string; normalized_signal: NormalizedSignal; config_version: number }>();

  if (!row || row.user_id !== user.id)
    return Response.json({ error: "Decision not found" }, { status: 404 });
  if (row.status !== "PROPOSED")
    return Response.json({ error: `Decision is ${row.status}, not PROPOSED` }, { status: 409 });

  if (action === "reject") {
    await admin
      .from("auto_trade_decisions")
      .update({ status: "CANCELLED", reason: "Rejected by user" } as never)
      .eq("id", id);
    return Response.json({ ok: true, status: "CANCELLED" });
  }

  // Approve: re-evaluate against the current config + fresh chain, then execute.
  const cfg = await loadConfigRow(admin, user.id);
  if (!cfg) return Response.json({ error: "No trading configuration" }, { status: 400 });

  const signal = row.normalized_signal;
  try {
    const evaluation = await evaluateEntry(admin, user.id, signal, cfg);
    const decision = evaluation.decision;
    // A proposed trade only executes if it still clears every gate.
    if (decision.status !== "EXECUTED" && decision.status !== "PROPOSED" && decision.status !== "DRY_RUN") {
      await admin
        .from("auto_trade_decisions")
        .update({ status: decision.status, reason: `On approval: ${decision.reason}`, audit_trail: decision.audit as never } as never)
        .eq("id", id);
      return Response.json({ ok: false, status: decision.status, reason: decision.reason });
    }

    const result = await executePlan(admin, user.id, signal, decision, evaluation.chainSource ?? "mock");
    const finalStatus = result.executed ? "EXECUTED" : "FAILED";
    await admin
      .from("auto_trade_decisions")
      .update({
        status: finalStatus,
        reason: result.executed ? "Approved and executed" : result.detail,
        strike: decision.plan?.strike ?? null,
        expiry: decision.plan?.expiry ?? null,
        delta: decision.plan?.delta ?? null,
        entry_price: decision.plan?.entryPrice ?? null,
        quantity: decision.plan?.quantity ?? null,
        lot_size: decision.plan?.lotSize ?? null,
        target: decision.plan?.target ?? null,
        stop_loss: decision.plan?.stopLoss ?? null,
        audit_trail: [...decision.audit, { step: "Execution", ok: result.executed, detail: result.detail }] as never,
        order_id: result.orderId ?? null,
        position_id: result.positionId ?? null,
      } as never)
      .eq("id", id);

    return Response.json({ ok: result.executed, status: finalStatus, detail: result.detail });
  } catch (e) {
    return Response.json({ error: (e as Error).message ?? "Approve failed" }, { status: 500 });
  }
}
