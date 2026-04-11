import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BrokerConnection } from "@/types/database";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const BROKER_PAGE = "/dashboard/broker";

function redirectWithStatus(status: string, params: Record<string, string>) {
  const url = new URL(BROKER_PAGE, APP_URL);
  url.searchParams.set("status", status);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return Response.redirect(url.toString());
}

function getMidnightIST(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const tomorrow = new Date(istNow);
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const utcMidnight = new Date(tomorrow.getTime() - istOffset);
  return utcMidnight.toISOString();
}

async function handleUpstox(
  code: string,
  userId: string,
  connection: BrokerConnection
): Promise<Response> {
  const redirectUri = `${APP_URL}/api/broker/oauth/callback`;

  const body = new URLSearchParams({
    code,
    client_id: connection.api_key ?? "",
    client_secret: connection.api_secret ?? "",
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(
    "https://api.upstox.com/v2/login/authorization/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return redirectWithStatus("error", {
      message: `Upstox token exchange failed: ${text}`,
    });
  }

  const data = await res.json();
  const accessToken = data.access_token;

  if (!accessToken) {
    return redirectWithStatus("error", {
      message: "No access token received from Upstox",
    });
  }

  const supabase = await createClient();
  await supabase
    .from("broker_connections")
    .update({
      access_token: accessToken,
      is_connected: true,
      is_active: true,
      token_expiry: getMidnightIST(),
      last_connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("user_id", userId)
    .eq("broker_id", "upstox");

  // Deactivate other brokers
  await supabase
    .from("broker_connections")
    .update({ is_active: false, updated_at: new Date().toISOString() } as never)
    .eq("user_id", userId)
    .neq("broker_id", "upstox");

  return redirectWithStatus("success", { broker: "upstox" });
}

async function handleZerodha(
  code: string,
  userId: string,
  connection: BrokerConnection
): Promise<Response> {
  const apiKey = connection.api_key ?? "";
  const apiSecret = connection.api_secret ?? "";

  // Build SHA-256 checksum: sha256(api_key + request_token + api_secret)
  const checksumInput = apiKey + code + apiSecret;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(checksumInput)
  );
  const checksum = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const body = new URLSearchParams({
    api_key: apiKey,
    request_token: code,
    checksum,
  });

  const res = await fetch("https://api.kite.trade/session/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    return redirectWithStatus("error", {
      message: `Zerodha token exchange failed: ${text}`,
    });
  }

  const data = await res.json();
  const accessToken = data.data?.access_token;

  if (!accessToken) {
    return redirectWithStatus("error", {
      message: "No access token received from Zerodha",
    });
  }

  const supabase = await createClient();
  await supabase
    .from("broker_connections")
    .update({
      access_token: accessToken,
      is_connected: true,
      is_active: true,
      token_expiry: getMidnightIST(),
      last_connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("user_id", userId)
    .eq("broker_id", "zerodha");

  // Deactivate other brokers
  await supabase
    .from("broker_connections")
    .update({ is_active: false, updated_at: new Date().toISOString() } as never)
    .eq("user_id", userId)
    .neq("broker_id", "zerodha");

  return redirectWithStatus("success", { broker: "zerodha" });
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) {
      return redirectWithStatus("error", {
        message: "Missing code or state parameter",
      });
    }

    const [brokerId, userId] = state.split(":");

    if (!brokerId || !userId) {
      return redirectWithStatus("error", {
        message: "Invalid state parameter format",
      });
    }

    // Only Upstox and Zerodha use OAuth
    if (!["upstox", "zerodha"].includes(brokerId)) {
      return redirectWithStatus("error", {
        message: `${brokerId} does not use OAuth flow`,
      });
    }

    // Fetch saved credentials for this broker
    const supabase = await createClient();
    const { data: connection } = await supabase
      .from("broker_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("broker_id", brokerId)
      .single<BrokerConnection>();

    if (!connection) {
      return redirectWithStatus("error", {
        message: "No saved credentials found. Configure the broker first.",
      });
    }

    switch (brokerId) {
      case "upstox":
        return await handleUpstox(code, userId, connection);
      case "zerodha":
        return await handleZerodha(code, userId, connection);
      default:
        return redirectWithStatus("error", { message: "Unsupported broker" });
    }
  } catch {
    return redirectWithStatus("error", {
      message: "OAuth callback failed unexpectedly",
    });
  }
}
