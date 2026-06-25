import { createClient } from "@/lib/supabase/client";
import type { WatchlistItem } from "@/types/database";

// Watchlist persistence in Supabase (replaces localStorage) so it syncs across
// devices/sessions. The `watchlist` table is user-scoped (RLS own-rows) with a
// unique(user_id, symbol) constraint. Note: the table stores symbol +
// company_name (no exchange column), so callers default exchange to display.

export async function getWatchlist(userId: string): Promise<WatchlistItem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("watchlist")
    .select("*")
    .eq("user_id", userId)
    .order("added_at", { ascending: false })
    .returns<WatchlistItem[]>();
  return data ?? [];
}

export async function addToWatchlist(
  userId: string,
  item: { symbol: string; company_name: string }
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("watchlist")
    .insert({ user_id: userId, symbol: item.symbol, company_name: item.company_name } as never);
  // Unique-violation (already watched) is not a real failure for the UI.
  return !error || error.code === "23505";
}

export async function removeFromWatchlist(userId: string, symbol: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("user_id", userId)
    .eq("symbol", symbol);
  return !error;
}
