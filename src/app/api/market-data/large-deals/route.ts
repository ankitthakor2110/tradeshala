import { createClient } from "@/lib/supabase/server";
import { fetchLargeDeals } from "@/lib/market-data/large-deals";
import { readLargeDeals } from "@/lib/market-data/large-deals-store";

export const dynamic = "force-dynamic";

/**
 * NSE bulk / block / short deals — exchange-reported large transactions. Session-
 * gated (any logged-in user).
 *
 * Reads the durable `large_deals` snapshot first (written by the standalone
 * scripts/nse-largedeals.mjs writer, which runs where NSE is reachable — this is
 * the production path, since NSE blocks Vercel's datacenter IPs). Falls back to
 * an in-process live fetch when the table is empty (local dev, or before the
 * writer's first run), and reports `unavailable` (never mock) if neither works.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const stored = await readLargeDeals(supabase);
  if (stored.source === "nse" && stored.deals.length > 0) {
    return Response.json(stored);
  }

  // No snapshot yet — try a live fetch (works where NSE isn't IP-blocked).
  const live = await fetchLargeDeals();
  if (live.source === "unavailable") {
    return Response.json(live, { status: 503 });
  }
  return Response.json(live);
}
