import { NextRequest, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TV_WEBHOOK_CONFIG } from "@/config/tradingview";
import { validateWebhook, normalizeInbound, isActionPayload } from "@/lib/tv/schema";
import { secretsMatch, ipAllowed, dedupeKey } from "@/lib/tv/engine";
import { insertLog, updateLog, isDuplicate, applySignal } from "@/lib/tv/processor";
import { executeOnEngine } from "@/services/trade-engine.server";
import { buildAlertText, sendTelegramAlert } from "@/lib/tv/notify";

// ============================================================================
// PAPER-TRADING ONLY — this endpoint records TradingView signals into the tv_*
// ledger and, when TV_ENGINE_EXECUTION is on, ALSO places a paper order in the
// trade simulator. It NEVER places a real broker order; no broker client exists.
// ============================================================================

// Node runtime (we use node:crypto for the constant-time secret compare).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The response returns as soon as the ledger write succeeds; engine execution and
// Telegram run in `after()` (post-response). Give that background work headroom
// (60s is the max on Vercel Hobby, and well within Pro) so slow provider calls
// finish even though TradingView has already received its 200.
export const maxDuration = 60;

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null;
}

/** Best-effort dedupe key from a raw parsed object (before strict validation). */
function dedupeKeyFromRaw(obj: Record<string, unknown> | null): string | null {
  if (!obj || typeof obj.price !== "number") return null;
  return dedupeKey({
    id: obj.id == null ? null : String(obj.id),
    strategy: String(obj.strategy ?? ""),
    event: String(obj.event ?? ""),
    symbol: String(obj.symbol ?? ""),
    price: obj.price,
    time: obj.time == null ? null : String(obj.time),
  });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type");
  const ip = clientIp(req);

  // Read the raw body and JSON-parse it regardless of content-type (TradingView
  // sends text/plain when the body isn't auto-detected as JSON).
  const raw = await req.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object") parsed = v as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  // Normalize broker-style TradingView payloads (ticker/action/string-price/
  // epoch-time) into the canonical shape before dedupe + validation. Action
  // payloads (BUY/SELL) use the flip model, so force reverse for them.
  const fromAction = isActionPayload(parsed);
  const normalized = parsed ? normalizeInbound(parsed) : null;

  // --- AUTH (before logging, so unauthenticated callers can't spam the log) ---
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) {
    return json({ ok: false, error: "WEBHOOK_SECRET is not configured on the server" }, 503);
  }

  if (!ipAllowed(TV_WEBHOOK_CONFIG.ipAllowlist, ip)) {
    return json({ ok: false, error: "IP not allowed" }, 401);
  }

  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ??
    (typeof parsed?.secret === "string" ? parsed.secret : null);
  if (!secretsMatch(provided, expected)) {
    return json({ ok: false, error: "Invalid or missing secret" }, 401);
  }

  // --- LOG raw body BEFORE processing (auth has passed) ---
  const admin = createAdminClient();
  const key = dedupeKeyFromRaw(normalized);
  const logId = await insertLog(admin, {
    content_type: contentType,
    source_ip: ip,
    raw_body: raw,
    parsed_json: parsed,
    dedupe_key: key,
  });

  try {
    // --- PARSE check ---
    if (normalized === null) {
      await updateLog(admin, logId, "rejected", "Body is not valid JSON");
      return json({ ok: false, error: "Body is not valid JSON" }, 400);
    }

    // --- VALIDATE (strict; 422 names the bad field) ---
    const result = validateWebhook(normalized);
    if (!result.ok) {
      await updateLog(admin, logId, "rejected", result.message);
      return json({ ok: false, error: result.message }, 422);
    }

    // --- DEDUPE ---
    if (key && (await isDuplicate(admin, key))) {
      await updateLog(admin, logId, "rejected", "Duplicate signal (within dedupe window)");
      return json({ ok: true, duplicate: true }, 200);
    }

    // --- PROCESS (update the paper-trading ledger) ---
    const applied = await applySignal(admin, result.payload, {
      allowReverse: fromAction ? true : undefined,
    });

    // The ledger is the source of truth and has now succeeded, so mark the log
    // processed and reply IMMEDIATELY. TradingView aborts webhooks that take
    // longer than ~3s, and the engine (live option-chain fetch) + Telegram calls
    // below can easily exceed that — so they run AFTER the response is sent.
    await updateLog(admin, logId, "processed");

    // actionLabel is the original BUY/SELL for broker-style payloads, else the
    // entry side / EXIT. Computed here (needs `parsed`) and closed over by after().
    const actionLabel =
      typeof parsed?.action === "string"
        ? parsed.action.trim().toUpperCase()
        : result.payload.event === "entry"
          ? result.payload.side.toUpperCase()
          : "EXIT";
    const actionable =
      applied.handled === "opened" || applied.handled === "closed" || applied.handled === "reversed";
    const payload = result.payload;

    // --- POST-RESPONSE: engine execution + Telegram (best-effort) ---
    // Neither may fail the webhook — the ledger already succeeded. Failures are
    // logged to the server console (the orders/positions tables and Telegram are
    // where outcomes are observed).
    after(async () => {
      try {
        const engine = await executeOnEngine(admin, payload, applied.handled);
        if (engine && !engine.executed) {
          console.warn(`[tv-webhook] engine not executed: ${engine.detail}`);
        }
      } catch (e) {
        console.error(`[tv-webhook] engine error:`, (e as Error).message);
      }

      if (actionable) {
        try {
          await sendTelegramAlert(buildAlertText(payload, applied, actionLabel));
        } catch (e) {
          console.error(`[tv-webhook] notify error:`, (e as Error).message);
        }
      }
    });

    return json({ ok: true, ...applied }, 200);
  } catch (e) {
    const message = (e as Error).message ?? "Processing failed";
    await updateLog(admin, logId, "rejected", message).catch(() => {});
    return json({ ok: false, error: message }, 500);
  }
}
