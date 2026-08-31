import { createClient } from "@/lib/supabase/server";
import { DEFAULT_AUTO_CONFIG, mergeConfig, validateConfig } from "@/lib/auto/config";
import type { AutoTradeConfig } from "@/types/autoTrade";

// Per-account trading configuration (spec sections 4–29). Session-gated; the
// user reads/writes ONLY their own row (own-row RLS). Every save bumps the
// version and appends a trading_config_versions history row (audit, section 30).

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("trading_configs")
    .select("config, version, emergency_stopped, updated_at")
    .eq("user_id", user.id)
    .maybeSingle<{ config: unknown; version: number; emergency_stopped: boolean; updated_at: string }>();

  return Response.json({
    config: data ? mergeConfig(data.config) : DEFAULT_AUTO_CONFIG,
    version: data?.version ?? 0,
    emergencyStopped: data?.emergency_stopped ?? false,
    exists: !!data,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const config: AutoTradeConfig = mergeConfig(body);
  const errors = validateConfig(config);
  if (errors.length > 0) return Response.json({ error: "Invalid configuration", errors }, { status: 400 });

  const { data: existing } = await supabase
    .from("trading_configs")
    .select("version, emergency_stopped")
    .eq("user_id", user.id)
    .maybeSingle<{ version: number; emergency_stopped: boolean }>();

  const nextVersion = (existing?.version ?? 0) + 1;

  const { error: upsertErr } = await supabase.from("trading_configs").upsert(
    {
      user_id: user.id,
      config: config as never,
      version: nextVersion,
      emergency_stopped: existing?.emergency_stopped ?? false,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id" }
  );
  if (upsertErr) return Response.json({ error: upsertErr.message }, { status: 500 });

  // Append the version-history row (audit trail).
  await supabase.from("trading_config_versions").insert({
    user_id: user.id,
    version: nextVersion,
    config: config as never,
    changed_by: user.id,
  } as never);

  return Response.json({ ok: true, version: nextVersion, config });
}
