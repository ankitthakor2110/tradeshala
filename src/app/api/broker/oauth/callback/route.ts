import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { getPublicOrigin } from "@/lib/app-url";
import type { BrokerConnection } from "@/types/database";

const BROKER_PAGE = "/dashboard/broker";

// `origin` is the real request origin (see getPublicOrigin) — threaded through so
// the token-exchange redirect_uri and every post-login redirect use the exact
// domain the user is on, never a stale NEXT_PUBLIC_APP_URL.
function redirectWithStatus(origin: string, status: string, params: Record<string, string>) {
  const url = new URL(BROKER_PAGE, origin);
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
  origin: string,
  code: string,
  userId: string,
  connection: BrokerConnection | null
): Promise<Response> {
  // MUST equal the redirect_uri used in the authorize step (reconnect route),
  // which also derives from the request origin — so they always agree.
  const redirectUri = `${origin}/api/broker/oauth/callback`;

  // Credentials from the saved DB row, falling back to env (.env.local) — the
  // DB secret is encrypted, the env secret is plaintext.
  const apiKey = connection?.api_key ?? process.env.UPSTOX_API_KEY ?? "";
  const apiSecret = connection?.api_secret
    ? decryptSecret(connection.api_secret) ?? ""
    : process.env.UPSTOX_API_SECRET ?? "";

  if (!apiKey || !apiSecret) {
    return redirectWithStatus(origin, "error", {
      message: "Upstox API key/secret not configured (DB or env).",
    });
  }

  const body = new URLSearchParams({
    code,
    client_id: apiKey,
    client_secret: apiSecret,
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
    return redirectWithStatus(origin, "error", {
      message: `Upstox token exchange failed: ${text}`,
    });
  }

  const data = await res.json();
  const accessToken = data.access_token;

  if (!accessToken) {
    return redirectWithStatus(origin, "error", {
      message: "No access token received from Upstox",
    });
  }

  const supabase = await createClient();
  const tokenFields = {
    access_token: encryptSecret(accessToken),
    is_connected: true,
    is_active: true,
    token_expiry: getMidnightIST(),
    last_connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Update the existing row, or insert one when the connection was env-only
  // (no DB row yet) — otherwise the fresh token would be written nowhere.
  const { data: existing } = await supabase
    .from("broker_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("broker_id", "upstox")
    .maybeSingle<{ id: string }>();

  if (existing) {
    await supabase.from("broker_connections").update(tokenFields as never).eq("id", existing.id);
  } else {
    await supabase.from("broker_connections").insert({
      user_id: userId,
      broker_name: "Upstox",
      broker_id: "upstox",
      api_key: apiKey,
      api_secret: encryptSecret(apiSecret),
      ...tokenFields,
    } as never);
  }

  // Deactivate other brokers
  await supabase
    .from("broker_connections")
    .update({ is_active: false, updated_at: new Date().toISOString() } as never)
    .eq("user_id", userId)
    .neq("broker_id", "upstox");

  return redirectWithStatus(origin, "success", { broker: "upstox" });
}

async function handleZerodha(
  origin: string,
  code: string,
  userId: string,
  connection: BrokerConnection
): Promise<Response> {
  const apiKey = connection.api_key ?? "";
  const apiSecret = decryptSecret(connection.api_secret) ?? "";

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
    return redirectWithStatus(origin, "error", {
      message: `Zerodha token exchange failed: ${text}`,
    });
  }

  const data = await res.json();
  const accessToken = data.data?.access_token;

  if (!accessToken) {
    return redirectWithStatus(origin, "error", {
      message: "No access token received from Zerodha",
    });
  }

  const supabase = await createClient();
  await supabase
    .from("broker_connections")
    .update({
      access_token: encryptSecret(accessToken),
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

  return redirectWithStatus(origin, "success", { broker: "zerodha" });
}

export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request);
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");

    if (!code || !state) {
      return redirectWithStatus(origin, "error", {
        message: "Missing code or state parameter",
      });
    }

    const [brokerId, stateUserId] = state.split(":");

    if (!brokerId || !stateUserId) {
      return redirectWithStatus(origin, "error", {
        message: "Invalid state parameter format",
      });
    }

    // Only Upstox and Zerodha use OAuth
    if (!["upstox", "zerodha"].includes(brokerId)) {
      return redirectWithStatus(origin, "error", {
        message: `${brokerId} does not use OAuth flow`,
      });
    }

    // Derive the user from the authenticated session — never trust the user id
    // carried in the URL. The `state` value is then validated against the
    // session as a CSRF check (it must match the user who initiated the flow).
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return redirectWithStatus(origin, "error", { message: "Not signed in" });
    }

    if (stateUserId !== user.id) {
      return redirectWithStatus(origin, "error", {
        message: "State mismatch — possible CSRF. Please retry the connection.",
      });
    }

    const userId = user.id;

    // Fetch saved credentials for this broker (may be absent for Upstox when
    // credentials live only in .env.local — handleUpstox falls back to env).
    const { data: connection } = await supabase
      .from("broker_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("broker_id", brokerId)
      .maybeSingle<BrokerConnection>();

    switch (brokerId) {
      case "upstox":
        return await handleUpstox(origin, code, userId, connection);
      case "zerodha":
        if (!connection) {
          return redirectWithStatus(origin, "error", {
            message: "No saved credentials found. Configure Zerodha first.",
          });
        }
        return await handleZerodha(origin, code, userId, connection);
      default:
        return redirectWithStatus(origin, "error", { message: "Unsupported broker" });
    }
  } catch (e) {
    return redirectWithStatus(origin, "error", {
      message: `OAuth callback failed: ${(e as Error).message ?? "unexpected error"}`,
    });
  }
}
