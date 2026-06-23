import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TV_WEBHOOK_CONFIG } from "@/config/tradingview";
import { validateWebhook } from "@/lib/tv/schema";
import { secretsMatch, ipAllowed, dedupeKey } from "@/lib/tv/engine";
import { insertLog, updateLog, isDuplicate, applySignal } from "@/lib/tv/processor";

// ============================================================================
// PAPER-TRADING ONLY — this endpoint records TradingView signals into the tv_*
// ledger. It NEVER places a real broker order. No broker client is imported.
// ============================================================================

// Node runtime (we use node:crypto for the constant-time secret compare).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const key = dedupeKeyFromRaw(parsed);
  const logId = await insertLog(admin, {
    content_type: contentType,
    source_ip: ip,
    raw_body: raw,
    parsed_json: parsed,
    dedupe_key: key,
  });

  try {
    // --- PARSE check ---
    if (parsed === null) {
      await updateLog(admin, logId, "rejected", "Body is not valid JSON");
      return json({ ok: false, error: "Body is not valid JSON" }, 400);
    }

    // --- VALIDATE (strict; 422 names the bad field) ---
    const result = validateWebhook(parsed);
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
    const applied = await applySignal(admin, result.payload);
    await updateLog(admin, logId, "processed");
    return json({ ok: true, ...applied }, 200);
  } catch (e) {
    const message = (e as Error).message ?? "Processing failed";
    await updateLog(admin, logId, "rejected", message).catch(() => {});
    return json({ ok: false, error: message }, 500);
  }
}
