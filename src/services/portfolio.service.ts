import { createClient } from "@/lib/supabase/client";
import { TRADE_CONFIG } from "@/config/trade";

// The Portfolio page is an account-summary view; its numbers come from the live
// positions summary (usePositions) plus the user's virtual cash. This is the
// only portfolio-specific read — everything else is derived client-side.

export async function getVirtualCash(userId: string): Promise<number> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("virtual_balance")
    .eq("id", userId)
    .single<{ virtual_balance: number }>();
  return data?.virtual_balance ?? 0;
}

export interface ResetResult {
  success: boolean;
  message: string;
}

/**
 * Full "reset account": wipes the user's entire paper-trading footprint and
 * restores virtual cash to the fresh-account starting balance. Deletes every
 * order (executed + pending) and every position (open + closed), then sets
 * virtual_balance back to TRADE_CONFIG.startingBalance.
 *
 * Runs against the user's own rows via the session client — RLS (own-row CRUD
 * on orders/positions, own-row update on profiles) scopes it to the caller, so
 * one user can never reset another's account. The three writes aren't a single
 * transaction; on a partial failure the caller surfaces the error and the user
 * can retry (the operation is idempotent — re-running converges to the same
 * clean state). Orders are deleted before positions (no FK between them, but
 * this keeps the order deterministic).
 */
export async function resetTradingAccount(userId: string): Promise<ResetResult> {
  const supabase = createClient();
  try {
    const { error: ordersErr } = await supabase.from("orders").delete().eq("user_id", userId);
    if (ordersErr) return { success: false, message: `Failed to clear orders: ${ordersErr.message}` };

    const { error: posErr } = await supabase.from("positions").delete().eq("user_id", userId);
    if (posErr) return { success: false, message: `Failed to clear positions: ${posErr.message}` };

    const { error: balErr } = await supabase
      .from("profiles")
      .update({ virtual_balance: TRADE_CONFIG.startingBalance } as never)
      .eq("id", userId);
    if (balErr) return { success: false, message: `Failed to reset balance: ${balErr.message}` };

    return { success: true, message: "Account reset — fresh virtual balance restored." };
  } catch (e) {
    return { success: false, message: (e as Error).message ?? "Reset failed" };
  }
}
