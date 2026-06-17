import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveUniverse } from "@/lib/market-data/universe";
import { fetchLtpBatch, isUpstoxConfigured } from "@/lib/market-data/upstox";
import { getMarketStatus } from "@/services/dashboard.service";

// Pro plan: functions/cron may run up to 800s. Vercel Cron fires this every
// minute; within one invocation we loop, refreshing every ~10s, so the live
// table stays fresh between cron ticks. (On Hobby, cron runs only daily.)
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const REFRESH_INTERVAL_MS = 10_000;
const SAFETY_MARGIN_MS = 15_000; // stop looping before the function is killed

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One pass: resolve the universe, fetch LTPs, upsert into live_quotes. */
async function snapshotOnce(
  admin: ReturnType<typeof createAdminClient>
): Promise<number> {
  const universe = await getActiveUniverse(admin);
  if (universe.length === 0) return 0;

  const quotes = await fetchLtpBatch(universe);
  if (quotes.length === 0) return 0;

  const nowIso = new Date().toISOString();
  const rows = quotes.map((q) => ({
    symbol: q.symbol,
    exchange: q.exchange,
    ltp: q.ltp,
    prev_close: q.prev_close,
    change: q.change,
    change_percent: q.change_percent,
    volume: q.volume,
    ts: nowIso,
    updated_at: nowIso,
  }));

  const { error } = await admin
    .from("live_quotes")
    .upsert(rows as never, { onConflict: "symbol" });

  if (error) throw new Error(`live_quotes upsert failed: ${error.message}`);
  return rows.length;
}

export async function GET(request: NextRequest) {
  // Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the env
  // var is set. Reject anything else so the endpoint can't be triggered freely.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isUpstoxConfigured()) {
    return Response.json(
      { error: "Upstox is not configured (UPSTOX_ACCESS_TOKEN missing/expired)" },
      { status: 503 }
    );
  }

  const admin = createAdminClient();

  try {
    // Market closed: take a single snapshot so closing prices persist, then exit.
    if (!getMarketStatus()) {
      const written = await snapshotOnce(admin);
      return Response.json({ ok: true, market: "closed", passes: 1, written });
    }

    // Market open: refresh repeatedly until close to the function deadline.
    const deadline = Date.now() + (maxDuration * 1000 - SAFETY_MARGIN_MS);
    let passes = 0;
    let lastWritten = 0;

    while (Date.now() < deadline && getMarketStatus()) {
      lastWritten = await snapshotOnce(admin);
      passes += 1;
      if (Date.now() + REFRESH_INTERVAL_MS >= deadline) break;
      await sleep(REFRESH_INTERVAL_MS);
    }

    return Response.json({ ok: true, market: "open", passes, lastWritten });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
