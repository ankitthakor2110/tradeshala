import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MarketData, BrokerConnection } from "@/types/database";

const CACHE_TTL_MS = 60_000; // 1 minute cache

async function fetchUpstoxQuote(
  symbol: string,
  accessToken: string
): Promise<MarketData | null> {
  const instrument = `NSE_EQ|${symbol}`;
  const res = await fetch(
    `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrument)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) return null;
  const json = await res.json();
  const quote = json.data?.[instrument]?.ohlc;
  const ltp = json.data?.[instrument]?.last_price;
  if (!quote || ltp == null) return null;

  return {
    symbol,
    exchange: "NSE",
    last_price: ltp,
    open_price: quote.open ?? 0,
    high_price: quote.high ?? 0,
    low_price: quote.low ?? 0,
    close_price: quote.close ?? 0,
    change: ltp - (quote.close ?? 0),
    change_percent: quote.close ? ((ltp - quote.close) / quote.close) * 100 : 0,
    volume: json.data?.[instrument]?.volume ?? 0,
    last_updated: new Date().toISOString(),
  };
}

async function fetchZerodhaQuote(
  symbol: string,
  apiKey: string,
  accessToken: string
): Promise<MarketData | null> {
  const res = await fetch(
    `https://api.kite.trade/quote?i=NSE:${symbol}`,
    {
      headers: {
        Authorization: `token ${apiKey}:${accessToken}`,
        "X-Kite-Version": "3",
      },
    }
  );
  if (!res.ok) return null;
  const json = await res.json();
  const quote = json.data?.[`NSE:${symbol}`];
  if (!quote) return null;

  return {
    symbol,
    exchange: "NSE",
    last_price: quote.last_price ?? 0,
    open_price: quote.ohlc?.open ?? 0,
    high_price: quote.ohlc?.high ?? 0,
    low_price: quote.ohlc?.low ?? 0,
    close_price: quote.ohlc?.close ?? 0,
    change: quote.change ?? 0,
    change_percent: quote.change_percent ?? 0,
    volume: quote.volume ?? 0,
    last_updated: new Date().toISOString(),
  };
}

async function fetchDhanQuote(
  symbol: string,
  accessToken: string
): Promise<MarketData | null> {
  const res = await fetch(
    `https://api.dhan.co/marketfeed/ltp?exchangeSegment=NSE_EQ&securityId=${symbol}`,
    {
      headers: {
        "access-token": accessToken,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) return null;
  const json = await res.json();
  const ltp = json.data?.ltp;
  if (ltp == null) return null;

  return {
    symbol,
    exchange: "NSE",
    last_price: ltp,
    open_price: json.data?.open ?? 0,
    high_price: json.data?.high ?? 0,
    low_price: json.data?.low ?? 0,
    close_price: json.data?.close ?? 0,
    change: ltp - (json.data?.close ?? 0),
    change_percent: json.data?.close
      ? ((ltp - json.data.close) / json.data.close) * 100
      : 0,
    volume: json.data?.volume ?? 0,
    last_updated: new Date().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get("symbol");

    if (!symbol) {
      return Response.json(
        { error: "symbol query parameter is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check cache first (market_data_cache is not in typed schema)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cached } = await (supabase as any)
      .from("market_data_cache")
      .select("*")
      .eq("symbol", symbol.toUpperCase())
      .single();

    if (cached) {
      const age = Date.now() - new Date(cached.cached_at).getTime();
      if (age < CACHE_TTL_MS) {
        return Response.json(cached);
      }
    }

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get active broker
    const { data: broker } = await supabase
      .from("broker_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single<BrokerConnection>();

    if (!broker) {
      return Response.json(
        { error: "No active broker connection found" },
        { status: 404 }
      );
    }

    // Fetch from the appropriate broker API
    let marketData: MarketData | null = null;
    const sym = symbol.toUpperCase();

    switch (broker.broker_id) {
      case "upstox":
        if (broker.access_token) {
          marketData = await fetchUpstoxQuote(sym, broker.access_token);
        }
        break;
      case "zerodha":
        if (broker.api_key && broker.access_token) {
          marketData = await fetchZerodhaQuote(
            sym,
            broker.api_key,
            broker.access_token
          );
        }
        break;
      case "dhan":
        if (broker.access_token) {
          marketData = await fetchDhanQuote(sym, broker.access_token);
        }
        break;
      default:
        return Response.json(
          { error: `Market data not supported for broker: ${broker.broker_id}` },
          { status: 400 }
        );
    }

    if (!marketData) {
      return Response.json(
        { error: "Failed to fetch market data from broker" },
        { status: 502 }
      );
    }

    // Cache the result (market_data_cache is not in typed schema)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("market_data_cache").upsert(
      {
        symbol: sym,
        exchange: marketData.exchange,
        last_price: marketData.last_price,
        open_price: marketData.open_price,
        high_price: marketData.high_price,
        low_price: marketData.low_price,
        close_price: marketData.close_price,
        change: marketData.change,
        change_percent: marketData.change_percent,
        volume: marketData.volume,
        last_updated: marketData.last_updated,
        cached_at: new Date().toISOString(),
      },
      { onConflict: "symbol" }
    );

    return Response.json(marketData);
  } catch {
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
