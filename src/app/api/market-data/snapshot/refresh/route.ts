import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUpstoxConfigured } from "@/lib/market-data/upstox";
import { snapshotOnce } from "@/lib/market-data/snapshot";
import { runGttOnce } from "@/lib/trade/gtt";
import { getMarketStatus } from "@/services/dashboard.service";

export const dynamic = "force-dynamic";

// If `live_quotes` was refreshed within this window, skip the upstream Upstox
// fetch and report the existing data as fresh. This collapses the polls coming
// from many open browsers into roughly one actual provider call per window.
const MIN_REFRESH_GAP_MS = 10_000;

/**
 * Client-triggered single snapshot pass. Unlike the cron GET (gated by
 * CRON_SECRET and run by Vercel), this is gated by the caller's Supabase
 * session so any logged-in user viewing a live page can keep `live_quotes`
 * fresh while the Hobby cron only fires daily. The write fans out to all
 * clients via Supabase Realtime.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isUpstoxConfigured()) {
    return Response.json(
      { ok: false, error: "Upstox is not configured (UPSTOX_ACCESS_TOKEN missing/expired)" },
      { status: 503 }
    );
  }

  const admin = createAdminClient();

  // Throttle: if another client refreshed very recently, don't hit Upstox again.
  const { data: latest } = await admin
    .from("live_quotes")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .returns<{ updated_at: string }[]>();

  const lastTs = latest?.[0]?.updated_at
    ? new Date(latest[0].updated_at).getTime()
    : 0;
  if (Date.now() - lastTs < MIN_REFRESH_GAP_MS) {
    return Response.json({ ok: true, skipped: true });
  }

  try {
    const written = await snapshotOnce(admin);
    // Drive a server-side GTT pass too: on Hobby this is the only intraday
    // server compute, so any open tab keeps everyone's exits firing.
    const gttActions = await runGttOnce(admin).catch(() => 0);
    return Response.json({
      ok: true,
      written,
      gttActions,
      market: getMarketStatus() ? "open" : "closed",
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
