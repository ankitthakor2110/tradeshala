import { createClient } from "@/lib/supabase/server";
import { getSharedUpstoxStatus } from "@/lib/market-data/upstox";

// Lightweight shared-Upstox-token status for the dashboard banner. Reads only
// the DB token state (no live Upstox API call), so it's cheap to poll. Any
// authenticated user may read it — it reveals only whether live data is
// currently authorized, not the token itself.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getSharedUpstoxStatus();
  return Response.json(status);
}
