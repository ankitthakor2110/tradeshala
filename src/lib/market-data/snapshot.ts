import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveUniverse } from "@/lib/market-data/universe";
import { fetchLtpBatch } from "@/lib/market-data/upstox";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * One snapshot pass: resolve the active universe, fetch LTPs from Upstox, and
 * upsert them into the shared `live_quotes` table. Returns the number of rows
 * written. Shared by the Vercel Cron writer (loops this on Pro) and the
 * client-triggered refresh route (one pass per browser poll on Hobby).
 */
export async function snapshotOnce(admin: Admin): Promise<number> {
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
