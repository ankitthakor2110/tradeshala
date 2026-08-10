import { createClient } from "@/lib/supabase/server";
import { getQuote, getPrimaryProvider } from "@/lib/market-data";
import { FINDER_CONFIG } from "@/config/finder";
import type { ScreenerRow } from "@/types/finder";

export const dynamic = "force-dynamic";

/**
 * Trade Finder scan pass. Session-gated (any logged-in user), it fetches a live
 * quote for each symbol in the curated finder universe via the provider
 * aggregator and returns them as screener rows. All values are real provider
 * data — when no provider is configured it returns `unavailable`, never mock
 * prices. Ranking/filtering happens client-side (pure `src/lib/finder`).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (getPrimaryProvider() === "none") {
    return Response.json(
      { rows: [], source: "unavailable", last_updated: new Date().toISOString() },
      { status: 503 }
    );
  }

  const settled = await Promise.allSettled(
    FINDER_CONFIG.universe.map((u) => getQuote(u.symbol))
  );

  const rows: ScreenerRow[] = [];
  let source: "dhan" | "upstox" | "unavailable" = "unavailable";
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value.data) {
      rows.push(r.value.data);
      if (r.value.source !== "unavailable") source = r.value.source;
    }
  }

  if (rows.length === 0) {
    return Response.json(
      { rows: [], source: "unavailable", last_updated: new Date().toISOString() },
      { status: 503 }
    );
  }

  return Response.json({ rows, source, last_updated: new Date().toISOString() });
}
