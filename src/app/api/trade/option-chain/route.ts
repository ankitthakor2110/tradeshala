import { NextRequest } from "next/server";
import type { OptionChainData } from "@/types/database";

interface ChainResponse {
  symbol: string;
  expiry: string;
  underlyingPrice: number;
  atmStrike: number;
  chain: OptionChainData[];
  source: "dhan" | "upstox" | "mock";
}

const STRIKE_GAPS: Record<string, number> = {
  NIFTY: 50,
  BANKNIFTY: 100,
  FINNIFTY: 50,
  SENSEX: 100,
};

// --- DhanHQ ---
async function fetchDhan(symbol: string, expiry: string): Promise<ChainResponse | null> {
  const token = process.env.DHAN_ACCESS_TOKEN;
  const clientId = process.env.DHAN_CLIENT_ID;
  if (!token || !clientId || token.startsWith("your_")) return null;

  try {
    const res = await fetch(
      `https://api.dhan.co/v2/optionchain?symbol=${encodeURIComponent(symbol)}&expiry=${encodeURIComponent(expiry)}`,
      {
        headers: {
          "access-token": token,
          "client-id": clientId,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.data) return null;

    const underlying = data.data.underlyingValue ?? data.data.underlying_price ?? 0;
    const gap = STRIKE_GAPS[symbol] ?? 50;
    const atm = Math.round(underlying / gap) * gap;

    const rawChain = data.data.optionChain ?? data.data.chain ?? [];
    const chain: OptionChainData[] = rawChain.map(
      (row: Record<string, unknown>) => {
        const ceLtp = (row.ce_ltp as number) ?? ((row.ce as Record<string, number>)?.ltp) ?? 0;
        const peLtp = (row.pe_ltp as number) ?? ((row.pe as Record<string, number>)?.ltp) ?? 0;
        const ceBid = (row.ce_bid as number) ?? ((row.ce as Record<string, number>)?.bid) ?? 0;
        const ceAsk = (row.ce_ask as number) ?? ((row.ce as Record<string, number>)?.ask) ?? 0;
        const peBid = (row.pe_bid as number) ?? ((row.pe as Record<string, number>)?.bid) ?? 0;
        const peAsk = (row.pe_ask as number) ?? ((row.pe as Record<string, number>)?.ask) ?? 0;
        const ceOi = (row.ce_oi as number) ?? ((row.ce as Record<string, number>)?.oi) ?? 0;
        const peOi = (row.pe_oi as number) ?? ((row.pe as Record<string, number>)?.oi) ?? 0;
        return {
        strike_price: (row.strikePrice as number) ?? (row.strike_price as number) ?? 0,
        ce: {
          ltp: ceLtp, change: 0, changePercent: 0,
          bid: ceBid, ask: ceAsk, bidAskSpread: ceAsk - ceBid,
          oi: ceOi, oiChange: 0, oiChangePercent: 0,
          volume: (row.ce_volume as number) ?? ((row.ce as Record<string, number>)?.volume) ?? 0,
          iv: (row.ce_iv as number) ?? ((row.ce as Record<string, number>)?.iv) ?? 0,
          delta: 0, theta: 0,
        },
        pe: {
          ltp: peLtp, change: 0, changePercent: 0,
          bid: peBid, ask: peAsk, bidAskSpread: peAsk - peBid,
          oi: peOi, oiChange: 0, oiChangePercent: 0,
          volume: (row.pe_volume as number) ?? ((row.pe as Record<string, number>)?.volume) ?? 0,
          iv: (row.pe_iv as number) ?? ((row.pe as Record<string, number>)?.iv) ?? 0,
          delta: 0, theta: 0,
        },
        pcr: ceOi > 0 ? Math.round((peOi / ceOi) * 100) / 100 : 0,
        totalCeOI: 0,
        totalPeOI: 0,
      };});

    return { symbol, expiry, underlyingPrice: underlying, atmStrike: atm, chain, source: "dhan" };
  } catch {
    return null;
  }
}

// --- Upstox ---
async function fetchUpstox(symbol: string, expiry: string): Promise<ChainResponse | null> {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token || token.startsWith("your_")) return null;

  const instrumentMap: Record<string, string> = {
    NIFTY: "NSE_INDEX|Nifty 50",
    BANKNIFTY: "NSE_INDEX|Nifty Bank",
    FINNIFTY: "NSE_INDEX|Nifty Fin Service",
    SENSEX: "BSE_INDEX|SENSEX",
  };

  const instrumentKey = instrumentMap[symbol];
  if (!instrumentKey) return null;

  try {
    const res = await fetch(
      `https://api.upstox.com/v2/option/chain?instrument_key=${encodeURIComponent(instrumentKey)}&expiry_date=${encodeURIComponent(expiry)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.data) return null;

    const rows = data.data as Record<string, unknown>[];
    if (!rows.length) return null;

    const underlying = (rows[0]?.underlying_spot_price as number) ?? 0;
    const gap = STRIKE_GAPS[symbol] ?? 50;
    const atm = Math.round(underlying / gap) * gap;

    const chain: OptionChainData[] = rows.map((row) => {
      const ce = row.call_options as Record<string, unknown> | undefined;
      const pe = row.put_options as Record<string, unknown> | undefined;
      const ceGreeks = ce?.option_greeks as Record<string, number> | undefined;
      const peGreeks = pe?.option_greeks as Record<string, number> | undefined;
      const ceMd = ce?.market_data as Record<string, number> | undefined;
      const peMd = pe?.market_data as Record<string, number> | undefined;

      const ceLtp = ceMd?.ltp ?? 0;
      const peLtp = peMd?.ltp ?? 0;
      const ceBid = ceMd?.bid_price ?? 0;
      const ceAsk = ceMd?.ask_price ?? 0;
      const peBid = peMd?.bid_price ?? 0;
      const peAsk = peMd?.ask_price ?? 0;
      const ceOi = ceMd?.oi ?? 0;
      const peOi = peMd?.oi ?? 0;
      return {
        strike_price: (row.strike_price as number) ?? 0,
        ce: {
          ltp: ceLtp, change: 0, changePercent: 0,
          bid: ceBid, ask: ceAsk, bidAskSpread: ceAsk - ceBid,
          oi: ceOi, oiChange: 0, oiChangePercent: 0,
          volume: ceMd?.volume ?? 0, iv: ceGreeks?.iv ?? 0,
          delta: ceGreeks?.delta ?? 0, theta: ceGreeks?.theta ?? 0,
        },
        pe: {
          ltp: peLtp, change: 0, changePercent: 0,
          bid: peBid, ask: peAsk, bidAskSpread: peAsk - peBid,
          oi: peOi, oiChange: 0, oiChangePercent: 0,
          volume: peMd?.volume ?? 0, iv: peGreeks?.iv ?? 0,
          delta: peGreeks?.delta ?? 0, theta: peGreeks?.theta ?? 0,
        },
        pcr: ceOi > 0 ? Math.round((peOi / ceOi) * 100) / 100 : 0,
        totalCeOI: 0, totalPeOI: 0,
      };
    });

    return { symbol, expiry, underlyingPrice: underlying, atmStrike: atm, chain, source: "upstox" };
  } catch {
    return null;
  }
}

// --- Mock generator ---
function r2(n: number) { return Math.round(n * 100) / 100; }

function generateMockChain(symbol: string, expiry: string): ChainResponse {
  const underlyingPrices: Record<string, number> = { NIFTY: 24050, BANKNIFTY: 55900, FINNIFTY: 23800, SENSEX: 79500 };
  const underlying = underlyingPrices[symbol] ?? 24000;
  const gap = STRIKE_GAPS[symbol] ?? 50;
  const atm = Math.round(underlying / gap) * gap;

  let totalCeOI = 0;
  let totalPeOI = 0;
  const chain: OptionChainData[] = [];

  for (let i = -10; i <= 10; i++) {
    const strike = atm + i * gap;
    const diff = strike - underlying;
    const diffPct = Math.abs(diff) / underlying;
    const strikesFromAtm = Math.abs(i);

    const timeValue = underlying * 0.015 * Math.exp(-diffPct * 7);
    const ceIntrinsic = Math.max(underlying - strike, 0);
    const peIntrinsic = Math.max(strike - underlying, 0);
    const cePrice = r2(ceIntrinsic + timeValue);
    const pePrice = r2(peIntrinsic + timeValue);

    const ceSpread = r2(Math.max(cePrice * 0.008, 0.5));
    const peSpread = r2(Math.max(pePrice * 0.008, 0.5));
    const oiMul = Math.exp(-diffPct * 12);
    const baseOi = 300000 + Math.random() * 400000;
    const ceOi = Math.round(baseOi * oiMul);
    const peOi = Math.round(baseOi * oiMul * (0.8 + Math.random() * 0.4));
    const ceOiChg = Math.round(ceOi * (Math.random() * 0.25 - 0.1));
    const peOiChg = Math.round(peOi * (Math.random() * 0.25 - 0.1));
    const ceVol = Math.round(ceOi * (0.1 + Math.random() * 0.2));
    const peVol = Math.round(peOi * (0.1 + Math.random() * 0.2));

    const ceIv = r2(12 + strikesFromAtm * 0.8 + Math.random() * 2);
    const peIv = r2(12 + strikesFromAtm * 0.8 + Math.random() * 2);
    const ceDelta = r2(Math.max(0.05, Math.min(0.95, 0.5 + (underlying - strike) / (underlying * 0.05))));
    const peDelta = r2(ceDelta - 1);
    const ceTheta = r2(-0.3 - Math.random() * 1.5);
    const peTheta = r2(-0.3 - Math.random() * 1.5);

    const cePrevClose = r2(cePrice * (1 + (Math.random() * 0.1 - 0.05)));
    const pePrevClose = r2(pePrice * (1 + (Math.random() * 0.1 - 0.05)));

    totalCeOI += ceOi;
    totalPeOI += peOi;

    chain.push({
      strike_price: strike,
      ce: {
        ltp: cePrice, change: r2(cePrice - cePrevClose), changePercent: r2(cePrevClose ? ((cePrice - cePrevClose) / cePrevClose) * 100 : 0),
        bid: r2(cePrice - ceSpread), ask: r2(cePrice + ceSpread), bidAskSpread: r2(ceSpread * 2),
        oi: ceOi, oiChange: ceOiChg, oiChangePercent: r2(ceOi ? (ceOiChg / ceOi) * 100 : 0),
        volume: ceVol, iv: ceIv, delta: ceDelta, theta: ceTheta,
      },
      pe: {
        ltp: pePrice, change: r2(pePrice - pePrevClose), changePercent: r2(pePrevClose ? ((pePrice - pePrevClose) / pePrevClose) * 100 : 0),
        bid: r2(pePrice - peSpread), ask: r2(pePrice + peSpread), bidAskSpread: r2(peSpread * 2),
        oi: peOi, oiChange: peOiChg, oiChangePercent: r2(peOi ? (peOiChg / peOi) * 100 : 0),
        volume: peVol, iv: peIv, delta: peDelta, theta: peTheta,
      },
      pcr: r2(ceOi > 0 ? peOi / ceOi : 0),
      totalCeOI: 0,
      totalPeOI: 0,
    });
  }

  chain.forEach((row) => { row.totalCeOI = totalCeOI; row.totalPeOI = totalPeOI; });

  return { symbol, expiry, underlyingPrice: underlying, atmStrike: atm, chain, source: "mock" };
}

export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get("symbol")?.toUpperCase();
    const expiry = request.nextUrl.searchParams.get("expiry");

    if (!symbol) {
      return Response.json({ error: "symbol is required" }, { status: 400 });
    }

    if (!expiry) {
      return Response.json({ error: "expiry is required" }, { status: 400 });
    }

    // Try DhanHQ
    const dhanResult = await fetchDhan(symbol, expiry);
    if (dhanResult && dhanResult.chain.length > 0) {
      return Response.json(dhanResult);
    }

    // Try Upstox
    const upstoxResult = await fetchUpstox(symbol, expiry);
    if (upstoxResult && upstoxResult.chain.length > 0) {
      return Response.json(upstoxResult);
    }

    // Mock fallback
    return Response.json(generateMockChain(symbol, expiry));
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
