import { createClient } from "@/lib/supabase/server";
import { fetchLargeDeals } from "@/lib/market-data/large-deals";

export const dynamic = "force-dynamic";

/**
 * NSE bulk / block / short deals — exchange-reported large transactions. Session-
 * gated (any logged-in user). The fetcher caches in-process and serves stale data
 * over an NSE failure, and reports `unavailable` (never mock) if NSE can't be
 * reached at all. See lib/market-data/large-deals.ts for the datacenter-IP caveat.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const data = await fetchLargeDeals();
  if (data.source === "unavailable") {
    return Response.json(data, { status: 503 });
  }
  return Response.json(data);
}
