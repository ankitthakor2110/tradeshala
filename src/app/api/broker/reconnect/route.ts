import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicOrigin } from "@/lib/app-url";

/**
 * One-click Upstox reconnect — the target for the daily re-auth email link.
 * Clicking it (while signed into the app) 302-redirects straight to the Upstox
 * login dialog; the existing OAuth callback then stores the fresh token in the
 * DB, which the market-data layer reads at runtime. No manual URL hunting.
 */
export async function GET(request: NextRequest) {
  // Always the real domain the request came in on — so the redirect_uri sent to
  // Upstox matches its registered callback regardless of NEXT_PUBLIC_APP_URL.
  const APP_URL = getPublicOrigin(request);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in (e.g. clicked the email on a fresh browser) — send to login,
  // then bounce back here to start the OAuth flow.
  if (!user) {
    return Response.redirect(
      `${APP_URL}/login?next=${encodeURIComponent("/api/broker/reconnect")}`
    );
  }

  const { data: connection } = await supabase
    .from("broker_connections")
    .select("api_key")
    .eq("user_id", user.id)
    .eq("broker_id", "upstox")
    .maybeSingle<{ api_key: string | null }>();

  // Prefer the saved API key; fall back to the env-configured one so a setup
  // done via .env.local (no DB row) can still reconnect. The callback persists
  // a DB row on success, so subsequent reconnects work from either source.
  const envKey = process.env.UPSTOX_API_KEY;
  const apiKey =
    connection?.api_key ?? (envKey && !envKey.startsWith("your_") ? envKey : null);

  // Nothing to authorize with anywhere — guide the user to set it up.
  if (!apiKey) {
    return Response.redirect(
      `${APP_URL}/dashboard/broker?status=setup&message=${encodeURIComponent(
        "Add your Upstox API Key below, then use Reconnect to refresh the session."
      )}`
    );
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: apiKey,
    redirect_uri: `${APP_URL}/api/broker/oauth/callback`,
    state: `upstox:${user.id}`,
  });

  return Response.redirect(
    `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`
  );
}
