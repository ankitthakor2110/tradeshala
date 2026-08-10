import type { LargeDeal, DealType, DealSide } from "@/types/finder";

// Pure normalization + filtering for NSE large deals (bulk/block/short). No I/O
// or clock — the side-effecting fetch lives in lib/market-data/large-deals.ts.
// NSE reports numbers as strings ("72000", "24.9") and sometimes null, so parse
// defensively and drop rows that carry no usable symbol.

/** One raw row from NSE's largedeal payload (all fields optional/nullable). */
export interface RawDealRow {
  symbol?: string | null;
  name?: string | null;
  clientName?: string | null;
  buySell?: string | null;
  qty?: string | number | null;
  watp?: string | number | null;
  date?: string | null;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function toSide(v: string | null | undefined): DealSide | null {
  const s = v?.trim().toUpperCase();
  return s === "BUY" || s === "SELL" ? s : null;
}

/** Normalize a raw NSE row; returns null when there's no symbol to key on. */
export function normalizeDealRow(raw: RawDealRow, dealType: DealType): LargeDeal | null {
  const symbol = raw.symbol?.trim();
  if (!symbol) return null;
  return {
    symbol: symbol.toUpperCase(),
    name: raw.name?.trim() || symbol,
    clientName: raw.clientName?.trim() || "—",
    side: toSide(raw.buySell),
    qty: toNum(raw.qty) ?? 0,
    watp: toNum(raw.watp),
    date: raw.date?.trim() || "",
    dealType,
  };
}

/** NSE largedeal payload shape (only the arrays we consume). */
export interface RawLargeDealsPayload {
  as_on_date?: string | null;
  BULK_DEALS_DATA?: RawDealRow[] | null;
  BLOCK_DEALS_DATA?: RawDealRow[] | null;
  SHORT_DEALS_DATA?: RawDealRow[] | null;
}

/** Parse the full payload into a flat, typed deal list + the as-on date. */
export function parseLargeDeals(json: RawLargeDealsPayload): { deals: LargeDeal[]; asOn: string | null } {
  const pick = (rows: RawDealRow[] | null | undefined, type: DealType): LargeDeal[] =>
    (rows ?? []).map((r) => normalizeDealRow(r, type)).filter((d): d is LargeDeal => d !== null);

  const deals = [
    ...pick(json.BULK_DEALS_DATA, "bulk"),
    ...pick(json.BLOCK_DEALS_DATA, "block"),
    ...pick(json.SHORT_DEALS_DATA, "short"),
  ];
  return { deals, asOn: json.as_on_date?.trim() || null };
}

export interface DealFilters {
  dealType: DealType;
  side: DealSide | "all";
  query: string;
}

/** Filter by tab (deal type), side, and a symbol/company/client text query. */
export function filterDeals(deals: LargeDeal[], f: DealFilters): LargeDeal[] {
  const q = f.query.trim().toUpperCase();
  return deals.filter((d) => {
    if (d.dealType !== f.dealType) return false;
    if (f.side !== "all" && d.side !== f.side) return false;
    if (q && !(d.symbol.includes(q) || d.name.toUpperCase().includes(q) || d.clientName.toUpperCase().includes(q)))
      return false;
    return true;
  });
}

/** Set of symbols that appear in the deals (for cross-tagging screener rows). */
export function dealSymbolSet(deals: LargeDeal[]): Set<string> {
  return new Set(deals.map((d) => d.symbol));
}
