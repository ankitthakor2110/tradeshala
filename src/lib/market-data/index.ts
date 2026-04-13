import * as dhan from "./dhan";
import * as upstox from "./upstox";
import type { DhanHealthResult } from "./dhan";
import type { UpstoxHealthResult } from "./upstox";
import type { MarketData, StockGainerLoser } from "@/types/database";

export type DataSource = "dhan" | "upstox" | "unavailable";

interface WithSource<T> {
  data: T;
  source: DataSource;
}

function getPrimary() {
  if (dhan.isDhanConfigured()) return "dhan" as const;
  if (upstox.isUpstoxConfigured()) return "upstox" as const;
  return "none" as const;
}

export function getPrimaryProvider(): "dhan" | "upstox" | "none" {
  return getPrimary();
}

export async function healthCheck(): Promise<{
  dhan: DhanHealthResult;
  upstox: UpstoxHealthResult;
  primary: "dhan" | "upstox" | "none";
}> {
  const [dhanHealth, upstoxHealth] = await Promise.all([
    dhan.testConnection(),
    upstox.testConnection(),
  ]);

  return {
    dhan: dhanHealth,
    upstox: upstoxHealth,
    primary: getPrimary(),
  };
}

export async function getQuote(symbol: string): Promise<WithSource<MarketData | null>> {
  const primary = getPrimary();

  if (primary === "dhan" || primary === "none") {
    const result = await dhan.fetchQuote(symbol);
    if (result) return { data: result, source: "dhan" };
  }

  const upstoxResult = await upstox.fetchQuote(symbol);
  if (upstoxResult) return { data: upstoxResult, source: "upstox" };

  if (primary === "upstox") {
    const dhanResult = await dhan.fetchQuote(symbol);
    if (dhanResult) return { data: dhanResult, source: "dhan" };
  }

  return { data: null, source: "unavailable" };
}

export async function getIndices(): Promise<
  WithSource<{ nifty50: MarketData | null; bankNifty: MarketData | null }>
> {
  const primary = getPrimary();

  if (primary === "dhan" || primary === "none") {
    const result = await dhan.fetchIndices();
    if (result && (result.nifty50 || result.bankNifty)) {
      return { data: result, source: "dhan" };
    }
  }

  const upstoxResult = await upstox.fetchIndices();
  if (upstoxResult && (upstoxResult.nifty50 || upstoxResult.bankNifty)) {
    return { data: upstoxResult, source: "upstox" };
  }

  if (primary === "upstox") {
    const dhanResult = await dhan.fetchIndices();
    if (dhanResult && (dhanResult.nifty50 || dhanResult.bankNifty)) {
      return { data: dhanResult, source: "dhan" };
    }
  }

  return { data: { nifty50: null, bankNifty: null }, source: "unavailable" };
}

export async function getGainersLosers(): Promise<
  WithSource<{ gainers: StockGainerLoser[]; losers: StockGainerLoser[] }>
> {
  const primary = getPrimary();

  if (primary === "dhan" || primary === "none") {
    const result = await dhan.fetchGainersLosers();
    if (result && (result.gainers.length > 0 || result.losers.length > 0)) {
      return { data: result, source: "dhan" };
    }
  }

  const upstoxResult = await upstox.fetchGainersLosers();
  if (upstoxResult && (upstoxResult.gainers.length > 0 || upstoxResult.losers.length > 0)) {
    return { data: upstoxResult, source: "upstox" };
  }

  if (primary === "upstox") {
    const dhanResult = await dhan.fetchGainersLosers();
    if (dhanResult && (dhanResult.gainers.length > 0 || dhanResult.losers.length > 0)) {
      return { data: dhanResult, source: "dhan" };
    }
  }

  return { data: { gainers: [], losers: [] }, source: "unavailable" };
}

export async function search(
  query: string
): Promise<
  WithSource<{ symbol: string; company_name: string; exchange: string; instrument_type: string }[]>
> {
  const primary = getPrimary();

  if (primary === "dhan" || primary === "none") {
    const result = await dhan.searchStocks(query);
    if (result.length > 0) return { data: result, source: "dhan" };
  }

  const upstoxResult = await upstox.searchStocks(query);
  if (upstoxResult.length > 0) return { data: upstoxResult, source: "upstox" };

  if (primary === "upstox") {
    const dhanResult = await dhan.searchStocks(query);
    if (dhanResult.length > 0) return { data: dhanResult, source: "dhan" };
  }

  return { data: [], source: "unavailable" };
}
