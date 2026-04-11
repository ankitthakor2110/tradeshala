import type { MarketData } from "@/types/database";
import { getMarketStatus } from "@/services/dashboard.service";

export async function getLivePrice(
  symbol: string,
  exchange: string = "NSE"
): Promise<MarketData | null> {
  try {
    const res = await fetch(
      `/api/broker/market-data?symbol=${encodeURIComponent(symbol)}&exchange=${encodeURIComponent(exchange)}`
    );

    if (!res.ok) return null;

    return (await res.json()) as MarketData;
  } catch {
    return null;
  }
}

export async function getNiftyData(): Promise<MarketData | null> {
  return getLivePrice("^NSEI", "NSE");
}

export async function getBankNiftyData(): Promise<MarketData | null> {
  return getLivePrice("^NSEBANK", "NSE");
}

export async function getMultipleStockPrices(
  symbols: string[]
): Promise<MarketData[]> {
  const results = await Promise.allSettled(
    symbols.map((s) => getLivePrice(s))
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<MarketData | null> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value!);
}

export function subscribeToLiveUpdates(
  symbols: string[],
  callback: (data: MarketData[]) => void
): () => void {
  let active = true;

  async function poll() {
    if (!active) return;

    if (getMarketStatus()) {
      const data = await getMultipleStockPrices(symbols);
      if (active && data.length > 0) {
        callback(data);
      }
    }

    if (active) {
      setTimeout(poll, 5000);
    }
  }

  poll();

  return () => {
    active = false;
  };
}
