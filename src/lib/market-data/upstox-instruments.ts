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
  instrument_type?: string;
  trading_symbol?: string;
  name?: string;
  instrument_key?: string;
}

interface InstrumentCache {
  loadedAt: number;
  records: InstrumentRecord[];
  eqKeyBySymbol: Map<string, string>;
}

let cache: InstrumentCache | null = null;
let inflight: Promise<InstrumentCache> | null = null;

async function build(): Promise<InstrumentCache> {
  const res = await fetch(NSE_URL);
  if (!res.ok) throw new Error(`Upstox instrument master fetch failed: ${res.status}`);

  const json = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
  const all = JSON.parse(json) as RawInstrument[];

  const records: InstrumentRecord[] = [];
  const eqKeyBySymbol = new Map<string, string>();

  for (const r of all) {
    if (r.instrument_type !== "EQ" && r.instrument_type !== "INDEX") continue;
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
  }

  return { loadedAt: Date.now(), records, eqKeyBySymbol };
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

/** Resolve an NSE equity trading symbol to its ISIN-based Upstox instrument key. */
export async function resolveEquityKey(symbol: string): Promise<string | null> {
  try {
    const c = await getCache();
    return c.eqKeyBySymbol.get(symbol.trim().toUpperCase()) ?? null;
  } catch {
    return null;
  }
}
