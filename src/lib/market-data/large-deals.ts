import { parseLargeDeals, type RawLargeDealsPayload } from "@/lib/finder/deals";
import type { LargeDealsResponse } from "@/types/finder";

// Server-side fetch of NSE bulk/block/short deals. NSE gates its APIs behind a
// homepage cookie + browser-like headers, so we prime the cookie first. Results
// are cached in-process (deals only change through the day), which also shields
// NSE from repeated hits. Server-only — never import into client code.
//
// Caveat: NSE frequently blocks datacenter IPs (e.g. Vercel), so in production
// this can intermittently fail; on failure we serve the last good cache if we
// have one, else report `unavailable` (never fabricated rows).

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const LARGEDEAL_URL = "https://www.nseindia.com/api/snapshot-capital-market-largedeal";
const HOME_URL = "https://www.nseindia.com/";
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: { data: LargeDealsResponse; ts: number } | null = null;

function cookiesFrom(res: Response): string {
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const arr = getSetCookie
    ? getSetCookie.call(res.headers)
    : res.headers.get("set-cookie")
      ? [res.headers.get("set-cookie") as string]
      : [];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

const EMPTY: LargeDealsResponse = { deals: [], asOn: null, source: "unavailable" };

/** Fetch (or serve cached) NSE large deals. Never throws. */
export async function fetchLargeDeals(): Promise<LargeDealsResponse> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.data;

  try {
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
    if (!res.ok) return cache?.data ?? EMPTY;

    const json = (await res.json()) as RawLargeDealsPayload;
    const { deals, asOn } = parseLargeDeals(json);
    const data: LargeDealsResponse = { deals, asOn, source: "nse" };
    cache = { data, ts: Date.now() };
    return data;
  } catch {
    // Serve stale cache if we have it; otherwise honestly report unavailable.
    return cache?.data ?? EMPTY;
  }
}
