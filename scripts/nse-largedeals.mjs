// ============================================================================
// NSE Large Deals → large_deals (standalone snapshot writer)
// ----------------------------------------------------------------------------
// NSE gates its APIs behind a homepage cookie AND blocks datacenter IPs (Vercel),
// so the serverless route can't reliably fetch it in production. This standalone
// process fetches the bulk/block/short deals from a machine where NSE IS
// reachable (your box, or a small always-on host) and writes the snapshot to the
// shared `large_deals` table via the Supabase service role. The /dashboard/finder
// Large Deals panel then reads the table (see the large-deals route).
//
//   Run once:   npm run nse:deals      (loads .env.local, Node >= 20.6)
//   Scheduled:  wrap in cron/Task Scheduler every ~10 min during market hours.
//
// Mirrors the parsing in src/lib/finder/deals.ts and the mapping in
// src/lib/market-data/large-deals-store.ts — keep them in sync if the shape changes.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[nse-deals] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const HOME_URL = "https://www.nseindia.com/";
const LARGEDEAL_URL = "https://www.nseindia.com/api/snapshot-capital-market-largedeal";

function cookiesFrom(res) {
  const arr =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")]
        : [];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

const toNum = (v) => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};

const toSide = (v) => {
  const s = v?.trim().toUpperCase();
  return s === "BUY" || s === "SELL" ? s : null;
};

function normalizeRow(raw, dealType) {
  const symbol = raw.symbol?.trim();
  if (!symbol) return null;
  return {
    deal_type: dealType,
    symbol: symbol.toUpperCase(),
    name: raw.name?.trim() || symbol,
    client_name: raw.clientName?.trim() || "—",
    side: toSide(raw.buySell),
    qty: toNum(raw.qty) ?? 0,
    watp: toNum(raw.watp),
    deal_date: raw.date?.trim() || "",
  };
}

function parse(json) {
  const pick = (rows, type) => (rows ?? []).map((r) => normalizeRow(r, type)).filter(Boolean);
  const deals = [
    ...pick(json.BULK_DEALS_DATA, "bulk"),
    ...pick(json.BLOCK_DEALS_DATA, "block"),
    ...pick(json.SHORT_DEALS_DATA, "short"),
  ];
  return { deals, asOn: json.as_on_date?.trim() || null };
}

async function fetchDeals() {
  const home = await fetch(HOME_URL, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
  });
  const cookie = cookiesFrom(home);

  const res = await fetch(LARGEDEAL_URL, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.nseindia.com/market-data/large-deals",
      cookie,
    },
  });
  if (!res.ok) throw new Error(`NSE largedeal fetch failed: ${res.status} ${res.statusText}`);
  return parse(await res.json());
}

async function main() {
  const { deals, asOn } = await fetchDeals();
  if (deals.length === 0) {
    console.warn("[nse-deals] NSE returned no deals — leaving the last good snapshot intact.");
    return;
  }

  const rows = deals.map((d) => ({ ...d, as_on: asOn }));

  // Full-set snapshot: clear then insert.
  const del = await supabase.from("large_deals").delete().neq("id", 0);
  if (del.error) throw new Error(`delete failed: ${del.error.message}`);

  const ins = await supabase.from("large_deals").insert(rows);
  if (ins.error) throw new Error(`insert failed: ${ins.error.message}`);

  console.log(`[nse-deals] wrote ${rows.length} deals (as-on ${asOn ?? "?"}).`);
}

main().catch((err) => {
  console.error("[nse-deals]", err.message);
  process.exit(1);
});
