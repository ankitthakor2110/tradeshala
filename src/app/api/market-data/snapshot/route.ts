import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUpstoxConfigured } from "@/lib/market-data/upstox";
import { snapshotOnce } from "@/lib/market-data/snapshot";
import { runGttOnce } from "@/lib/trade/gtt";
import { recordIvHistoryOnce } from "@/lib/market-data/iv-history";
import { getMarketStatus } from "@/services/dashboard.service";

// Hobby caps serverless functions at 300s (and cron at once/day). Intra-day
// refresh is driven by the client poller (useSnapshotPoller) writing via the
// /refresh route; this cron pass loops within its budget as a daily backstop.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const REFRESH_INTERVAL_MS = 10_000;
const SAFETY_MARGIN_MS = 15_000; // stop looping before the function is killed

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
    // Capture today's IV/OI history once per invocation (daily series).
    const ivRows = await recordIvHistoryOnce(admin).catch(() => 0);

    // Market closed: take a single snapshot so closing prices persist, then exit.
    if (!getMarketStatus()) {
      const written = await snapshotOnce(admin);
      return Response.json({ ok: true, market: "closed", passes: 1, written, ivRows });
    }

    // Market open: refresh repeatedly until close to the function deadline; run a
    // server-side GTT pass each loop so exits fire even with no tab open (Pro).
    const deadline = Date.now() + (maxDuration * 1000 - SAFETY_MARGIN_MS);
    let passes = 0;
    let lastWritten = 0;
    let gttActions = 0;

    while (Date.now() < deadline && getMarketStatus()) {
      lastWritten = await snapshotOnce(admin);
      gttActions += await runGttOnce(admin).catch(() => 0);
      passes += 1;
      if (Date.now() + REFRESH_INTERVAL_MS >= deadline) break;
      await sleep(REFRESH_INTERVAL_MS);
    }

    return Response.json({ ok: true, market: "open", passes, lastWritten, gttActions, ivRows });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
