import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicOrigin } from "@/lib/app-url";
import type { BrokerConnection } from "@/types/database";

export async function GET(request: NextRequest) {
  try {
    const brokerId = request.nextUrl.searchParams.get("broker_id");

    if (!brokerId) {
      return Response.json(
        { error: "broker_id query parameter is required" },
        { status: 400 }
      );
    }

    if (!["upstox", "zerodha"].includes(brokerId)) {
      return Response.json(
        { error: `${brokerId} does not use OAuth. Use direct token entry.` },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // redirect_uri must come from the real request origin (not NEXT_PUBLIC_APP_URL)
    // so it matches the broker app's registered callback — same fix as the
    // reconnect/callback routes (prevents Upstox UDAPI100068).
    const REDIRECT_URI = `${getPublicOrigin(request)}/api/broker/oauth/callback`;

    // Fetch saved API key for this broker
    const { data: connection } = await supabase
      .from("broker_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("broker_id", brokerId)
      .maybeSingle<BrokerConnection>();

    // For Upstox, prefer the per-deploy env app key (local vs prod use different
    // apps) and fall back to a saved key — matching the reconnect route, so the
    // on-page "token expiring → refresh" buttons work for env-only setups too.
    const envKey = process.env.UPSTOX_API_KEY;
    const upstoxKey =
      (envKey && !envKey.startsWith("your_") ? envKey : null) ?? connection?.api_key ?? null;
    const clientId = brokerId === "upstox" ? upstoxKey : connection?.api_key ?? null;

    if (!clientId) {
      return Response.json(
        { error: "Save your API Key first before initiating OAuth." },
        { status: 400 }
      );
    }

    const state = `${brokerId}:${user.id}`;
    let authUrl: string;

    switch (brokerId) {
      case "upstox": {
        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: REDIRECT_URI,
          state,
        });
        authUrl = `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`;
        break;
      }

      case "zerodha": {
        const params = new URLSearchParams({
          api_key: clientId,
          v: "3",
        });
        authUrl = `https://kite.zerodha.com/connect/login?${params.toString()}`;
        break;
      }

      default:
        return Response.json(
          { error: "Unsupported broker" },
          { status: 400 }
        );
    }

    return Response.json({ authUrl });
  } catch {
    return Response.json(
      { error: "Failed to initiate OAuth flow" },
      { status: 500 }
    );
  }
}
