import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { UniverseEntry } from "./upstox";
import { resolveEquityKey } from "./upstox-instruments";
import { TRADE_CONFIG } from "@/config/trade";

/**
 * Resolves the set of instruments the snapshot writer should stream.
 *
 * Sources (deduped, capped at 500 — the Upstox per-request limit):
 *  - Indices shown on the dashboard / trade screen (always).
 *  - Popular equities from TRADE_CONFIG (always) — covers the trade screen,
 *    movers, and most watchlist/position symbols.
 *  - Distinct symbols from every user's `portfolios` and open `positions`.
 *
 * Note: the watchlist is client-side (localStorage), so watchlist-only symbols
 * are streamed only when they also appear in one of the sources above.
 */

const MAX_UNIVERSE = 500;

// Dashboard index tiles subscribe by these display symbols.
const INDEX_ENTRIES: UniverseEntry[] = [
  { symbol: "NIFTY 50", instrumentKey: "NSE_INDEX|Nifty 50", exchange: "NSE" },
  { symbol: "BANK NIFTY", instrumentKey: "NSE_INDEX|Nifty Bank", exchange: "NSE" },
  { symbol: "SENSEX", instrumentKey: "BSE_INDEX|SENSEX", exchange: "BSE" },
];

export async function getActiveUniverse(
  admin: SupabaseClient<Database>
): Promise<UniverseEntry[]> {
  // Collect the distinct equity symbols to stream.
  const equitySymbols = new Set<string>();
  for (const s of TRADE_CONFIG.popularStocks) equitySymbols.add(s.symbol);

  // Pull symbols held/traded across all users (service role bypasses RLS).
  // `positions` is not in the typed Database schema (typed inline per the trade
  // engine), so it's queried through an untyped client view.
  const untyped = admin as unknown as SupabaseClient;
  const [portfolios, positions] = await Promise.all([
    admin.from("portfolios").select("symbol"),
    untyped
      .from("positions")
      .select("symbol")
      .eq("status", "OPEN")
      .returns<{ symbol: string }[]>(),
  ]);

  for (const row of portfolios.data ?? []) {
    const sym = (row as { symbol?: string }).symbol;
    if (sym) equitySymbols.add(sym);
  }
  for (const row of positions.data ?? []) {
    if (row.symbol) equitySymbols.add(row.symbol);
  }

  // Indices use name keys; equities must be resolved to ISIN-based keys
  // (Upstox rejects NSE_EQ|<symbol>). Unresolvable symbols are skipped.
  const entries: UniverseEntry[] = [...INDEX_ENTRIES];
  for (const sym of equitySymbols) {
    if (entries.length >= MAX_UNIVERSE) break;
    const instrumentKey = await resolveEquityKey(sym);
    if (instrumentKey) entries.push({ symbol: sym, instrumentKey, exchange: "NSE" });
  }

  return entries.slice(0, MAX_UNIVERSE);
}
