import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LargeDealRow } from "@/types/database";
import type { LargeDeal, LargeDealsResponse } from "@/types/finder";

// Read/write the durable `large_deals` snapshot (see migration 20260813). The
// standalone writer (scripts/nse-largedeals.mjs) can't import this TS module, so
// it re-implements the same mapping inline — keep the two in sync if the shape
// changes. The route reads via `readLargeDeals` using the caller's session
// client (RLS: authenticated select), falling back to a live fetch when empty.

type DbClient = SupabaseClient<Database>;

/** Map a stored row back to the client-facing `LargeDeal`. */
export function rowToDeal(r: LargeDealRow): LargeDeal {
  return {
    symbol: r.symbol,
    name: r.name,
    clientName: r.client_name,
    side: r.side,
    qty: r.qty,
    watp: r.watp,
    date: r.deal_date,
    dealType: r.deal_type,
  };
}

/**
 * Pure: stored rows → the client-facing response. `source` is "nse" when rows
 * exist (rows are ordered newest-first, so the as-on date comes from the head).
 */
export function rowsToResponse(rows: LargeDealRow[]): LargeDealsResponse {
  if (rows.length === 0) return { deals: [], asOn: null, source: "unavailable" };
  return { deals: rows.map(rowToDeal), asOn: rows[0]?.as_on ?? null, source: "nse" };
}

/**
 * Read the latest large-deals snapshot from the table. `source` is "nse" when
 * rows exist, else "unavailable" so the route can fall back to a live fetch.
 * Never throws — a DB error resolves to `unavailable`.
 */
export async function readLargeDeals(client: DbClient): Promise<LargeDealsResponse> {
  try {
    const { data, error } = await client
      .from("large_deals")
      .select("*")
      .order("fetched_at", { ascending: false });

    if (error || !data || data.length === 0) {
      return { deals: [], asOn: null, source: "unavailable" };
    }

    return rowsToResponse(data as LargeDealRow[]);
  } catch {
    return { deals: [], asOn: null, source: "unavailable" };
  }
}

/**
 * Replace the stored snapshot with a fresh batch (service-role client). Deals are
 * a full-set snapshot, so we clear then insert. Returns rows written; a failed
 * or empty batch is a no-op that leaves the last good snapshot intact.
 */
export async function writeLargeDeals(
  admin: DbClient,
  resp: LargeDealsResponse
): Promise<number> {
  if (resp.source !== "nse" || resp.deals.length === 0) return 0;

  const rows = resp.deals.map((d) => ({
    deal_type: d.dealType,
    symbol: d.symbol,
    name: d.name,
    client_name: d.clientName,
    side: d.side,
    qty: d.qty,
    watp: d.watp,
    deal_date: d.date,
    as_on: resp.asOn,
  }));

  // Clear the old snapshot, then insert the new one. Single-writer + 5-min
  // cadence makes the brief empty window negligible (the route falls back to a
  // live fetch during it).
  await admin.from("large_deals").delete().neq("id", 0);
  const { error } = await admin.from("large_deals").insert(rows as never);
  if (error) throw new Error(error.message);
  return rows.length;
}
