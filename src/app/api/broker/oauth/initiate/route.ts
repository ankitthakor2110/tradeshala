import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BrokerConnection } from "@/types/database";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const REDIRECT_URI = `${APP_URL}/api/broker/oauth/callback`;

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

    // Fetch saved API key for this broker
    const { data: connection } = await supabase
      .from("broker_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("broker_id", brokerId)
      .single<BrokerConnection>();

    if (!connection?.api_key) {
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
          client_id: connection.api_key,
          redirect_uri: REDIRECT_URI,
          state,
        });
        authUrl = `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`;
        break;
      }

      case "zerodha": {
        const params = new URLSearchParams({
          api_key: connection.api_key,
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
