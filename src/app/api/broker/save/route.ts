import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto/secrets";
import type { BrokerConnection } from "@/types/database";

interface SavePayload {
  brokerId: string;
  brokerName: string;
  credentials: Record<string, string>;
}

/**
 * Returns the encrypted value for a secret field. If the incoming value is
 * blank (the browser redacts secrets, so an unchanged field arrives empty),
 * the existing encrypted value is preserved rather than wiped.
 */
function resolveSecret(
  incoming: string | undefined,
  existing: string | null | undefined
): string | null {
  if (incoming && incoming.trim() !== "") return encryptSecret(incoming);
  return existing ?? null;
}

/**
 * Persists broker credentials server-side so sensitive fields can be encrypted
 * with the server-only key before they touch the database. The user id is
 * taken from the authenticated session — never from the request body.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body: SavePayload = await request.json();
    const { brokerId, brokerName, credentials } = body;

    if (!brokerId || !brokerName || !credentials) {
      return Response.json(
        { success: false, error: "brokerId, brokerName and credentials are required" },
        { status: 400 }
      );
    }

    // Look up any existing row so unchanged (blank) secret fields are preserved
    // instead of being overwritten with null.
    const { data: existing } = await supabase
      .from("broker_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("broker_id", brokerId)
      .maybeSingle<BrokerConnection>();

    const row = {
      user_id: user.id,
      broker_id: brokerId,
      broker_name: brokerName,
      is_connected: existing?.is_connected ?? false,
      is_active: existing?.is_active ?? false,
      api_key: credentials.api_key ?? existing?.api_key ?? null,
      client_id: credentials.client_id ?? existing?.client_id ?? null,
      // Sensitive fields — encrypted at rest; preserved when submitted blank.
      api_secret: resolveSecret(credentials.api_secret, existing?.api_secret),
      access_token: resolveSecret(credentials.access_token, existing?.access_token),
      totp_secret: resolveSecret(credentials.totp_secret, existing?.totp_secret),
      token_expiry: existing?.token_expiry ?? null,
      last_connected_at: existing?.last_connected_at ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("broker_connections")
      .upsert(row as never, { onConflict: "user_id,broker_id" });

    if (error) {
      return Response.json({ success: false, error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, error: null });
  } catch {
    return Response.json(
      { success: false, error: "Failed to save broker credentials." },
      { status: 500 }
    );
  }
}
