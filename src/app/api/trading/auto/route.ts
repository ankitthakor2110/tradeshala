import { createClient } from "@/lib/supabase/server";

// Emergency controls (spec section 31): STOP / RESUME automatic trading. Toggles
// trading_configs.emergency_stopped for the current user. Existing positions are
// NOT closed. Session-gated, own-row only.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { stopped?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* default to stop */
  }
  const stopped = body.stopped !== false; // default true (stop)

  // Ensure a config row exists (creating an empty one is fine — it just carries
  // the emergency flag until the user saves a full config).
  const { data: existing } = await supabase
    .from("trading_configs")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle<{ user_id: string }>();

  if (!existing) {
    const { DEFAULT_AUTO_CONFIG } = await import("@/lib/auto/config");
    const { error } = await supabase.from("trading_configs").insert({
      user_id: user.id,
      config: DEFAULT_AUTO_CONFIG as never,
      version: 1,
      emergency_stopped: stopped,
    } as never);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, emergencyStopped: stopped });
  }

  const { error } = await supabase
    .from("trading_configs")
    .update({ emergency_stopped: stopped, updated_at: new Date().toISOString() } as never)
    .eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, emergencyStopped: stopped });
}
