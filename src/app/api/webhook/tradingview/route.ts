import { NextRequest, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TV_WEBHOOK_CONFIG } from "@/config/tradingview";
import { validateWebhook, normalizeInbound, isActionPayload, parseLooseJson } from "@/lib/tv/schema";
import { secretsMatch, ipAllowed, dedupeKey } from "@/lib/tv/engine";
import { insertLog, updateLog, isDuplicate, applySignal } from "@/lib/tv/processor";
// executeOnEngine (@/services/trade-engine.server) and the Telegram notifier
// (@/lib/tv/notify) are lazy-imported inside after() so their heavy transitive
// module graph (market-data provider layer) never loads on the cold-start path.

// ============================================================================
// PAPER-TRADING ONLY — this endpoint records TradingView signals into the tv_*
// ledger and, when TV_ENGINE_EXECUTION is on, ALSO places a paper order in the
// trade simulator. It NEVER places a real broker order; no broker client exists.
// ============================================================================

// Node runtime (we use node:crypto for the constant-time secret compare).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// TradingView aborts a webhook that doesn't respond within ~3s. So the route
// ACKs with a 200 as soon as the cheap in-memory auth gate passes, and runs the
// ENTIRE processing pipeline (log -> validate -> dedupe -> ledger -> engine ->
// Telegram) in `after()`, post-response. Give that background work headroom
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
  // Lenient parse: strict JSON first (valid payloads untouched), with a single
  // repair retry for the common leading-dot-decimal typo (`"delta":.60`) that
  // TradingView alert messages often contain and that would otherwise reject the
  // whole signal as invalid JSON.
  const raw = await req.text();
  const parsed = parseLooseJson(raw);

  // --- AUTH (cheap, in-memory) — the only work that runs before the 200. ---
  // These gates reject unauthenticated callers fast (no DB), so they can't spam
  // the log and TradingView still gets a quick, honest error for a bad secret/IP.
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

  // --- ACK IMMEDIATELY; run the WHOLE pipeline post-response. ---
  // TradingView aborts webhooks that take longer than ~3s. The ledger writes,
  // dedupe, engine fill, and Telegram are all internal, so they run in after()
  // and TradingView always gets a fast 200. Payload problems (bad JSON, invalid
  // fields, duplicates) surface in the tv_webhook_logs table with status
  // "rejected" — they no longer come back as an HTTP error to TradingView.
  after(async () => {
    const admin = createAdminClient();

    // Normalize broker-style payloads (ticker/action/string-price/epoch-time)
    // into the canonical shape before dedupe + validation. Action payloads
    // (BUY/SELL) use the flip model, so force reverse for them.
    const fromAction = isActionPayload(parsed);
    const normalized = parsed ? normalizeInbound(parsed) : null;
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
        return;
      }

      // --- VALIDATE (strict) ---
      const result = validateWebhook(normalized);
      if (!result.ok) {
        await updateLog(admin, logId, "rejected", result.message);
        return;
      }

      // --- DEDUPE ---
      if (key && (await isDuplicate(admin, key))) {
        await updateLog(admin, logId, "rejected", "Duplicate signal (within dedupe window)");
        return;
      }

      // --- PROCESS (update the paper-trading ledger) ---
      const applied = await applySignal(admin, result.payload, {
        allowReverse: fromAction ? true : undefined,
      });
      await updateLog(admin, logId, "processed");

      const payload = result.payload;
      // actionLabel is the original BUY/SELL for broker-style payloads, else the
      // entry side / EXIT.
      const actionLabel =
        typeof parsed?.action === "string"
          ? parsed.action.trim().toUpperCase()
          : payload.event === "entry"
            ? payload.side.toUpperCase()
            : "EXIT";
      const actionable =
        applied.handled === "opened" ||
        applied.handled === "closed" ||
        applied.handled === "reversed";

      // --- ENGINE EXECUTION (best-effort) ---
      // Lazy-import keeps the heavy market-data module graph off the cold-start
      // path. A failure here never affects the ledger (already written).
      try {
        const { executeOnEngine } = await import("@/services/trade-engine.server");
        const engine = await executeOnEngine(admin, payload, applied.handled);
        if (engine && !engine.executed) {
          console.warn(`[tv-webhook] engine not executed: ${engine.detail}`);
        }
      } catch (e) {
        console.error(`[tv-webhook] engine error:`, (e as Error).message);
      }

      // --- TELEGRAM ALERT (best-effort, lazy-imported) ---
      if (actionable) {
        try {
          const { buildAlertText, sendTelegramAlert } = await import("@/lib/tv/notify");
          await sendTelegramAlert(buildAlertText(payload, applied, actionLabel));
        } catch (e) {
          console.error(`[tv-webhook] notify error:`, (e as Error).message);
        }
      }
    } catch (e) {
      const message = (e as Error).message ?? "Processing failed";
      console.error(`[tv-webhook] processing error:`, message);
      await updateLog(admin, logId, "rejected", message).catch(() => {});
    }
  });

  return json({ ok: true, accepted: true }, 200);
}
