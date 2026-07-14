// Client-side fetchers for the Market Intelligence Dashboard. Thin wrappers over
// the existing /api/trade/* routes — all provider I/O stays server-side. Every
// call fails soft (null / empty) so a flaky feed degrades the page, not crashes it.

import type { ChainResponse } from "@/lib/market-data/option-chain";

export async function getChain(symbol: string, expiry: string): Promise<ChainResponse | null> {
  try {
    const res = await fetch(
      `/api/trade/option-chain?symbol=${encodeURIComponent(symbol)}&expiry=${encodeURIComponent(expiry)}`
    );
    if (!res.ok) return null;
    return (await res.json()) as ChainResponse;
  } catch {
    return null;
  }
}

export async function getExpiriesFor(symbol: string): Promise<string[]> {
  try {
    const res = await fetch(`/api/trade/expiries?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.expiries) ? data.expiries : [];
  } catch {
    return [];
  }
}

// Candles + gainers/losers already have typed fetchers in market-data.service.
export { getCandles, getGainersLosers, getIndicesData } from "./market-data.service";
