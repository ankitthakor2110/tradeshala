import { createClient } from "@/lib/supabase/client";
import type { BrokerConnection } from "@/types/database";

export interface BrokerResult {
  success: boolean;
  error: string | null;
}

export interface TestResult {
  success: boolean;
  message: string;
  brokerName: string;
}

/**
 * Strips encrypted secret material before a connection is handed to the
 * browser. The UI only needs to know a secret exists, never its value — the
 * stored value is ciphertext and is only ever decrypted server-side.
 */
function redactSecrets(conn: BrokerConnection): BrokerConnection {
  return {
    ...conn,
    api_secret: null,
    access_token: null,
    totp_secret: null,
  };
}

export async function getActiveBroker(
  userId: string
): Promise<BrokerConnection | null> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("broker_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle<BrokerConnection>();

    if (error || !data) return null;

    return redactSecrets(data);
  } catch {
    return null;
  }
}

export async function getAllBrokerConnections(
  userId: string
): Promise<BrokerConnection[]> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("broker_connections")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .returns<BrokerConnection[]>();

    if (error || !data) return [];

    return data.map(redactSecrets);
  } catch {
    return [];
  }
}

export async function saveBrokerCredentials(
  userId: string,
  brokerId: string,
  brokerName: string,
  credentials: Record<string, string>
): Promise<BrokerResult> {
  // Routed through the server so sensitive fields are encrypted at rest with
  // the server-only key. The userId param is kept for signature compatibility
  // but the server derives the real user from the session — it is not trusted.
  void userId;
  try {
    const response = await fetch("/api/broker/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brokerId, brokerName, credentials }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return { success: false, error: data.error ?? "Failed to save credentials." };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function testBrokerConnection(
  brokerId: string,
  credentials: Record<string, string>
): Promise<TestResult> {
  try {
    const response = await fetch("/api/broker/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brokerId, credentials }),
    });

    const data = await response.json();

    return {
      success: data.success ?? false,
      message: data.message ?? "Unknown error",
      brokerName: data.brokerName ?? brokerId,
    };
  } catch {
    return {
      success: false,
      message: "Failed to reach test endpoint. Please try again.",
      brokerName: brokerId,
    };
  }
}

export async function activateBroker(
  userId: string,
  connectionId: string
): Promise<BrokerResult> {
  try {
    const supabase = createClient();

    // Deactivate all existing connections for this user
    const { error: deactivateError } = await supabase
      .from("broker_connections")
      .update({ is_active: false, updated_at: new Date().toISOString() } as never)
      .eq("user_id", userId);

    if (deactivateError) {
      return { success: false, error: deactivateError.message };
    }

    // Activate the selected connection
    const { error } = await supabase
      .from("broker_connections")
      .update({
        is_active: true,
        is_connected: true,
        last_connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", connectionId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function deactivateBroker(
  userId: string,
  connectionId: string
): Promise<BrokerResult> {
  try {
    const supabase = createClient();

    const { error } = await supabase
      .from("broker_connections")
      .update({
        is_active: false,
        is_connected: false,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", connectionId)
      .eq("user_id", userId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function deleteBrokerConnection(
  connectionId: string
): Promise<BrokerResult> {
  try {
    const supabase = createClient();

    const { error } = await supabase
      .from("broker_connections")
      .delete()
      .eq("id", connectionId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch {
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}
