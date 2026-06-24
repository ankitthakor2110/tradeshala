import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * One-click Upstox reconnect — the target for the daily re-auth email link.
 * Clicking it (while signed into the app) 302-redirects straight to the Upstox
 * login dialog; the existing OAuth callback then stores the fresh token in the
 * DB, which the market-data layer reads at runtime. No manual URL hunting.
 */
export async function GET(request: NextRequest) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

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

  // No API key on file yet — reconnect has nothing to authorize with. Send the
  // user to the broker page with a guiding (not alarming) prompt to set it up.
  if (!connection?.api_key) {
    return Response.redirect(
      `${APP_URL}/dashboard/broker?status=setup&message=${encodeURIComponent(
        "Add your Upstox API Key below, then use Reconnect to refresh the session."
      )}`
    );
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: connection.api_key,
    redirect_uri: `${APP_URL}/api/broker/oauth/callback`,
    state: `upstox:${user.id}`,
  });

  return Response.redirect(
    `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`
  );
}
