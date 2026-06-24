import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Reset the shared TradingView paper account: clears open positions and closed
// trades, but KEEPS tv_webhook_logs for audit/debugging. PAPER TRADING ONLY —
// this only deletes ledger rows; no broker is involved.
//
// Because the ledger is shared (not per-user), this destructive action is gated
// to the admin email (the same boundary the rest of the app uses), not just any
// authenticated session.

export const dynamic = "force-dynamic";

const ALL_ROWS = "00000000-0000-0000-0000-000000000000"; // sentinel for "delete every row"

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && user.email !== adminEmail) {
    return Response.json({ error: "Only the admin can reset the shared paper account" }, { status: 403 });
  }

  const admin = createAdminClient();
  try {
    const [posErr, tradeErr] = await Promise.all([
      admin.from("tv_positions").delete().neq("id", ALL_ROWS),
      admin.from("tv_trades").delete().neq("id", ALL_ROWS),
    ]).then((res) => res.map((r) => r.error));

    if (posErr || tradeErr) {
      return Response.json(
        { error: (posErr ?? tradeErr)?.message ?? "Reset failed" },
        { status: 500 }
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message ?? "Reset failed" }, { status: 500 });
  }
}
