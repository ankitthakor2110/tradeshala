import type { OptionChainData } from "@/types/database";
import { getSharedUpstoxToken } from "@/lib/market-data/upstox";

// Shared server-side option-chain fetch (Dhan → Upstox → mock). Used by the
// /api/trade/option-chain route, the GTT executor, and the IV-history writer so
// they all price options the same way.

export interface ChainResponse {
  symbol: string;
  expiry: string;
  underlyingPrice: number;
  atmStrike: number;
  chain: OptionChainData[];
  source: "dhan" | "upstox" | "mock";
}

export const STRIKE_GAPS: Record<string, number> = {
  NIFTY: 50,
  BANKNIFTY: 100,
  FINNIFTY: 50,
  MIDCPNIFTY: 25,
  SENSEX: 100,
};

// Dhan underlying identifiers (security id + exchange segment) for the option
// chain APIs. NSE indices live in the IDX_I segment. SENSEX is intentionally
// omitted so it falls through to Upstox — its Dhan scrip/segment hasn't been
// verified against the instrument master.
export const DHAN_UNDERLYING: Record<string, { scrip: number; seg: string }> = {
  NIFTY: { scrip: 13, seg: "IDX_I" },
  BANKNIFTY: { scrip: 25, seg: "IDX_I" },
  FINNIFTY: { scrip: 27, seg: "IDX_I" },
  MIDCPNIFTY: { scrip: 442, seg: "IDX_I" },
};

interface DhanLeg {
  last_price?: number;
  oi?: number;
  volume?: number;
  implied_volatility?: number;
  top_bid_price?: number;
  top_ask_price?: number;
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
}

// --- DhanHQ ---
// v2 Option Chain API: POST with a JSON body keyed on the underlying's security
// id; the chain comes back as data.oc, an object mapping strike → { ce, pe }.
async function fetchDhan(symbol: string, expiry: string): Promise<ChainResponse | null> {
  const token = process.env.DHAN_ACCESS_TOKEN;
  const clientId = process.env.DHAN_CLIENT_ID;
  const underlying = DHAN_UNDERLYING[symbol];
  if (!token || !clientId || token.startsWith("your_") || !underlying) return null;

  try {
    const res = await fetch("https://api.dhan.co/v2/optionchain", {
      method: "POST",
      headers: {
        "access-token": token,
        "client-id": clientId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        UnderlyingScrip: underlying.scrip,
        UnderlyingSeg: underlying.seg,
        Expiry: expiry,
      }),
    });

    if (!res.ok) {
      console.warn(`[option-chain] Dhan ${symbol} ${expiry}: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const oc = data?.data?.oc as Record<string, { ce?: DhanLeg; pe?: DhanLeg }> | undefined;
    if (!oc) return null;

    const underlyingPrice = (data.data.last_price as number) ?? 0;
    const gap = STRIKE_GAPS[symbol] ?? 50;
    const atm = Math.round(underlyingPrice / gap) * gap;

    const leg = (l?: DhanLeg) => ({
      ltp: l?.last_price ?? 0,
      bid: l?.top_bid_price ?? 0,
      ask: l?.top_ask_price ?? 0,
      oi: l?.oi ?? 0,
      volume: l?.volume ?? 0,
      iv: l?.implied_volatility ?? 0,
      g: l?.greeks ?? {},
    });

    const chain: OptionChainData[] = Object.entries(oc)
      .map(([strike, row]) => {
        const c = leg(row.ce);
        const p = leg(row.pe);
        return {
          strike_price: Math.round(parseFloat(strike)),
          ce: {
            ltp: c.ltp, change: 0, changePercent: 0,
            bid: c.bid, ask: c.ask, bidAskSpread: c.ask - c.bid,
            oi: c.oi, oiChange: 0, oiChangePercent: 0,
            volume: c.volume, iv: c.iv,
            delta: c.g.delta ?? 0, gamma: c.g.gamma ?? 0, theta: c.g.theta ?? 0, vega: c.g.vega ?? 0,
          },
          pe: {
            ltp: p.ltp, change: 0, changePercent: 0,
            bid: p.bid, ask: p.ask, bidAskSpread: p.ask - p.bid,
            oi: p.oi, oiChange: 0, oiChangePercent: 0,
            volume: p.volume, iv: p.iv,
            delta: p.g.delta ?? 0, gamma: p.g.gamma ?? 0, theta: p.g.theta ?? 0, vega: p.g.vega ?? 0,
          },
          pcr: c.oi > 0 ? Math.round((p.oi / c.oi) * 100) / 100 : 0,
          totalCeOI: 0,
          totalPeOI: 0,
        };
      })
      .filter((r) => r.strike_price > 0)
      .sort((a, b) => a.strike_price - b.strike_price);

    return { symbol, expiry, underlyingPrice, atmStrike: atm, chain, source: "dhan" };
  } catch (e) {
    console.warn(`[option-chain] Dhan ${symbol} fetch failed:`, e);
    return null;
  }
}

// --- Upstox ---
async function fetchUpstox(symbol: string, expiry: string): Promise<ChainResponse | null> {
  // Shared DB token (set by the daily OAuth login), env fallback — same resolver
  // the snapshot/live-quotes path uses, so a reconnect reaches the chain too.
  const token = await getSharedUpstoxToken();
  if (!token) return null;

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
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
    );

    if (!res.ok) {
      console.warn(`[option-chain] Upstox ${symbol} ${expiry}: HTTP ${res.status}`);
      return null;
    }
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
        ce_key: (ce?.instrument_key as string) ?? null,
        pe_key: (pe?.instrument_key as string) ?? null,
        ce: {
          ltp: ceLtp, change: 0, changePercent: 0,
          bid: ceBid, ask: ceAsk, bidAskSpread: ceAsk - ceBid,
          oi: ceOi, oiChange: 0, oiChangePercent: 0,
          volume: ceMd?.volume ?? 0, iv: ceGreeks?.iv ?? 0,
          delta: ceGreeks?.delta ?? 0, gamma: ceGreeks?.gamma ?? 0, theta: ceGreeks?.theta ?? 0, vega: ceGreeks?.vega ?? 0,
        },
        pe: {
          ltp: peLtp, change: 0, changePercent: 0,
          bid: peBid, ask: peAsk, bidAskSpread: peAsk - peBid,
          oi: peOi, oiChange: 0, oiChangePercent: 0,
          volume: peMd?.volume ?? 0, iv: peGreeks?.iv ?? 0,
          delta: peGreeks?.delta ?? 0, gamma: peGreeks?.gamma ?? 0, theta: peGreeks?.theta ?? 0, vega: peGreeks?.vega ?? 0,
        },
        pcr: ceOi > 0 ? Math.round((peOi / ceOi) * 100) / 100 : 0,
        totalCeOI: 0, totalPeOI: 0,
      };
    });

    return { symbol, expiry, underlyingPrice: underlying, atmStrike: atm, chain, source: "upstox" };
  } catch (e) {
    console.warn(`[option-chain] Upstox ${symbol} fetch failed:`, e);
    return null;
  }
}

// --- Mock generator ---
function r2(n: number) { return Math.round(n * 100) / 100; }
function r4(n: number) { return Math.round(n * 10000) / 10000; }

export function generateMockChain(symbol: string, expiry: string): ChainResponse {
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
        volume: ceVol, iv: ceIv, delta: ceDelta, gamma: r4(0.002 + Math.random() * 0.003), theta: ceTheta, vega: r2(3 + Math.random() * 5),
      },
      pe: {
        ltp: pePrice, change: r2(pePrice - pePrevClose), changePercent: r2(pePrevClose ? ((pePrice - pePrevClose) / pePrevClose) * 100 : 0),
        bid: r2(pePrice - peSpread), ask: r2(pePrice + peSpread), bidAskSpread: r2(peSpread * 2),
        oi: peOi, oiChange: peOiChg, oiChangePercent: r2(peOi ? (peOiChg / peOi) * 100 : 0),
        volume: peVol, iv: peIv, delta: peDelta, gamma: r4(0.002 + Math.random() * 0.003), theta: peTheta, vega: r2(3 + Math.random() * 5),
      },
      pcr: r2(ceOi > 0 ? peOi / ceOi : 0),
      totalCeOI: 0,
      totalPeOI: 0,
    });
  }

  chain.forEach((row) => { row.totalCeOI = totalCeOI; row.totalPeOI = totalPeOI; });

  return { symbol, expiry, underlyingPrice: underlying, atmStrike: atm, chain, source: "mock" };
}

/** Dhan → Upstox → mock, returning the first non-empty chain. */
export async function fetchOptionChain(symbol: string, expiry: string): Promise<ChainResponse> {
  const dhan = await fetchDhan(symbol, expiry);
  if (dhan && dhan.chain.length > 0) return dhan;
  const upstox = await fetchUpstox(symbol, expiry);
  if (upstox && upstox.chain.length > 0) return upstox;
  return generateMockChain(symbol, expiry);
}
