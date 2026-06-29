import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Registry of option contracts a browser is currently viewing. The trade page
// POSTs the visible ATM±N strikes here (and re-POSTs as a heartbeat); the
// streaming worker reads the recently-requested set and subscribes to exactly
// those on the Upstox WebSocket. Session-gated so only logged-in users register.
//
// Cap per request — the worker streams a bounded window, so a runaway client
// can't blow up the subscription set.
const MAX_CONTRACTS = 80;

interface Contract {
  instrument_key: string;
  symbol: string;
  expiry: string;
  strike: number;
  option_type: "CE" | "PE";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { contracts?: Contract[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const contracts = (body.contracts ?? [])
    .filter(
      (c) =>
        c &&
        typeof c.instrument_key === "string" &&
        c.instrument_key.length > 0 &&
        (c.option_type === "CE" || c.option_type === "PE")
    )
    .slice(0, MAX_CONTRACTS);

  if (contracts.length === 0) {
    return Response.json({ ok: true, registered: 0 });
  }

  const now = new Date().toISOString();
  const rows = contracts.map((c) => ({
    instrument_key: c.instrument_key,
    symbol: c.symbol,
    expiry: c.expiry,
    strike: c.strike,
    option_type: c.option_type,
    requested_at: now,
  }));

  const admin = createAdminClient();
  const { error } = await admin
    .from("live_option_subscriptions")
    .upsert(rows as never, { onConflict: "instrument_key" });
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, registered: rows.length });
}
