import { gunzipSync } from "node:zlib";

/**
 * Upstox exposes no instrument-search REST API. Instead it publishes a gzipped
 * instrument master per exchange. We download the NSE file once, keep only the
 * tradable equities (EQ) and indices (INDEX) — ~2.5k of ~97k rows — and cache
 * the lean index in module memory (refreshed periodically).
 *
 * This is also the authoritative symbol → instrument_key map: Upstox equity
 * keys are ISIN-based (`NSE_EQ|INE002A01018`), so a symbol like "RELIANCE" must
 * be resolved here before it can be quoted.
 *
 * The file is public, so this works without an access token.
 */

const NSE_URL =
  "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const TTL_MS = 12 * 60 * 60 * 1000; // refresh twice a day

export interface InstrumentRecord {
  symbol: string; // trading_symbol, e.g. "RELIANCE"
  company_name: string; // e.g. "RELIANCE INDUSTRIES LTD"
  exchange: string; // "NSE"
  instrument_type: string; // "EQ" | "INDEX"
  instrument_key: string; // e.g. "NSE_EQ|INE002A01018"
}

interface RawInstrument {
  segment?: string;
  instrument_type?: string;
  trading_symbol?: string;
  name?: string;
  instrument_key?: string;
  underlying_symbol?: string;
  asset_symbol?: string;
  lot_size?: number;
  expiry?: number;
}

interface InstrumentCache {
  loadedAt: number;
  records: InstrumentRecord[];
  eqKeyBySymbol: Map<string, string>;
  // underlying symbol (e.g. "NIFTY", "RELIANCE") → F&O lot size.
  lotSizeBySymbol: Map<string, number>;
}

let cache: InstrumentCache | null = null;
let inflight: Promise<InstrumentCache> | null = null;

// Prefer the nearest expiry that is still in the future: a future expiry always
// beats a past one, and among futures the closer date wins. Lot sizes can differ
// across expiries during an exchange revision, so we key on the contract a user
// would actually trade next.
function preferExpiry(cand: number, cur: number, now: number): boolean {
  const candFuture = cand >= now;
  const curFuture = cur >= now;
  if (candFuture !== curFuture) return candFuture;
  return candFuture ? cand < cur : cand > cur;
}

async function build(): Promise<InstrumentCache> {
  const res = await fetch(NSE_URL);
  if (!res.ok) throw new Error(`Upstox instrument master fetch failed: ${res.status}`);

  const json = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
  const all = JSON.parse(json) as RawInstrument[];

  const records: InstrumentRecord[] = [];
  const eqKeyBySymbol = new Map<string, string>();
  const lotByUnderlying = new Map<string, { lot: number; expiry: number }>();
  const now = Date.now();

  for (const r of all) {
    if (r.instrument_type === "EQ" || r.instrument_type === "INDEX") {
      if (!r.trading_symbol || !r.instrument_key) continue;
      records.push({
        symbol: r.trading_symbol,
        company_name: r.name ?? r.trading_symbol,
        exchange: "NSE",
        instrument_type: r.instrument_type,
        instrument_key: r.instrument_key,
      });
      if (r.instrument_type === "EQ") {
        eqKeyBySymbol.set(r.trading_symbol.toUpperCase(), r.instrument_key);
      }
      continue;
    }

    // NSE F&O option rows carry the authoritative tradable lot size per underlying
    // (index and stock alike) — the exchange truth the static config only mirrors.
    if ((r.instrument_type === "CE" || r.instrument_type === "PE") && r.segment === "NSE_FO") {
      const underlying = (r.underlying_symbol ?? r.asset_symbol ?? "").toUpperCase();
      const lot = r.lot_size ?? 0;
      const expiry = r.expiry ?? 0;
      if (!underlying || lot <= 0) continue;
      const cur = lotByUnderlying.get(underlying);
      if (!cur || preferExpiry(expiry, cur.expiry, now)) {
        lotByUnderlying.set(underlying, { lot, expiry });
      }
    }
  }

  const lotSizeBySymbol = new Map<string, number>();
  for (const [sym, { lot }] of lotByUnderlying) lotSizeBySymbol.set(sym, lot);

  return { loadedAt: Date.now(), records, eqKeyBySymbol, lotSizeBySymbol };
}

async function getCache(): Promise<InstrumentCache> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  if (!inflight) {
    inflight = build()
      .then((c) => {
        cache = c;
        inflight = null;
        return c;
      })
      .catch((e) => {
        inflight = null;
        throw e;
      });
  }
  return inflight;
}

/** Search equities/indices by symbol or company name (symbol-prefix ranked first). */
export async function searchInstruments(query: string): Promise<InstrumentRecord[]> {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  let c: InstrumentCache;
  try {
    c = await getCache();
  } catch {
    return [];
  }

  const starts: InstrumentRecord[] = [];
  const contains: InstrumentRecord[] = [];
  for (const r of c.records) {
    const sym = r.symbol.toUpperCase();
    if (sym.startsWith(q)) starts.push(r);
    else if (sym.includes(q) || r.company_name.toUpperCase().includes(q)) contains.push(r);
  }

  return [...starts, ...contains].slice(0, 10);
}

/**
 * Authoritative F&O lot size for an underlying (index or stock), from the Upstox
 * instrument master. Returns null for non-F&O symbols or when the master is
 * unreachable — callers fall back to the static config, then 1.
 */
export async function resolveLotSize(symbol: string): Promise<number | null> {
  try {
    const c = await getCache();
    return c.lotSizeBySymbol.get(symbol.trim().toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

/** Resolve an NSE equity trading symbol to its ISIN-based Upstox instrument key. */
export async function resolveEquityKey(symbol: string): Promise<string | null> {
  try {
    const c = await getCache();
    return c.eqKeyBySymbol.get(symbol.trim().toUpperCase()) ?? null;
  } catch {
    return null;
  }
}
