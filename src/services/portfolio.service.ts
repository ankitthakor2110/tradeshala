import { createClient } from "@/lib/supabase/client";

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
