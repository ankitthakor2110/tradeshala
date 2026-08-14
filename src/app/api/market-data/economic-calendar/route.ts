import { createClient } from "@/lib/supabase/server";
import { fetchEconomicCalendar } from "@/lib/market-data/economic-calendar";

export const dynamic = "force-dynamic";

/**
 * Auto-fetched macro event calendar (FMP) for the Trade Finder's event-risk gate.
 * Session-gated (any logged-in user). Always returns 200 with whatever the
 * fetcher resolved — an empty `unavailable` payload is honest, and the client
 * still derives the weekly-expiry event on top so the gate keeps working.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const data = await fetchEconomicCalendar();
  return Response.json(data);
}
