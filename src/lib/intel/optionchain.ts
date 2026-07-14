// Pure option-chain analytics: OI-buildup classification, moneyness, PCR, and
// max pain. Provider feeds report change-in-OI as 0, so buildup is driven by
// SESSION deltas the hook computes (prev vs current poll). No DB / env / clock.

import type { OptionChainData } from "@/types/database";
import type { Moneyness, OiBuildup } from "@/types/intel";
import { round2 } from "./candles";

export interface DeltaThresholds {
  minOiChange: number;
  minLtpChange: number;
}

/**
 * Classify one option leg from its session OI delta and LTP move. Side-aware:
 *   OI ↑ & price ↓ → fresh writing (call = bearish, put = bullish)
 *   OI ↑ & price ↑ → long build-up
 *   OI ↓ & price ↑ → short covering
 *   OI ↓ & price ↓ → unwinding
 * `oiChange`/`ltpChange` below the noise floor ⇒ "neutral".
 */
export function classifyLeg(
  side: "ce" | "pe",
  oiChange: number | null,
  ltpChange: number | null,
  th: DeltaThresholds
): OiBuildup {
  if (oiChange == null || ltpChange == null) return "neutral";
  const oiUp = oiChange >= th.minOiChange;
  const oiDown = oiChange <= -th.minOiChange;
  const priceUp = ltpChange >= th.minLtpChange;
  const priceDown = ltpChange <= -th.minLtpChange;

  if (!oiUp && !oiDown) return "neutral";

  if (oiUp) {
    if (priceUp) return "long-buildup";
    if (priceDown) return side === "ce" ? "fresh-call-writing" : "fresh-put-writing";
    // OI up, price flat: treat as fresh writing (dominant on options).
    return side === "ce" ? "fresh-call-writing" : "fresh-put-writing";
  }
  // oiDown
  if (priceUp) return "short-covering";
  if (priceDown) return side === "ce" ? "call-unwinding" : "put-unwinding";
  return side === "ce" ? "call-unwinding" : "put-unwinding";
}

/** Human-readable label + sentiment tone for a buildup classification. */
export function buildupLabel(b: OiBuildup): { label: string; tone: "bull" | "bear" | "neutral" } {
  switch (b) {
    case "long-buildup":
      return { label: "Long Build-up", tone: "bull" };
    case "short-covering":
      return { label: "Short Covering", tone: "bull" };
    case "fresh-put-writing":
      return { label: "Put Writing", tone: "bull" };
    case "put-unwinding":
      return { label: "Put Unwinding", tone: "bear" };
    case "fresh-call-writing":
      return { label: "Call Writing", tone: "bear" };
    case "call-unwinding":
      return { label: "Call Unwinding", tone: "bull" };
    default:
      return { label: "—", tone: "neutral" };
  }
}

/** Moneyness of a strike for a given side, relative to spot / ATM strike. */
export function tagMoneyness(
  strike: number,
  atmStrike: number,
  spot: number,
  side: "ce" | "pe"
): Moneyness {
  if (strike === atmStrike) return "ATM";
  if (side === "ce") return strike < spot ? "ITM" : "OTM";
  return strike > spot ? "ITM" : "OTM";
}

export function computePCR(chain: OptionChainData[]): number {
  let ce = 0;
  let pe = 0;
  for (const r of chain) {
    ce += r.ce?.oi ?? 0;
    pe += r.pe?.oi ?? 0;
  }
  if (ce === 0) return 0;
  return round2(pe / ce);
}

/**
 * Max-pain strike: the expiry price at which total intrinsic value owed by
 * option writers is minimized (where the most OI expires worthless).
 */
export function maxPain(chain: OptionChainData[]): number {
  if (!chain.length) return 0;
  let best = chain[0].strike_price;
  let bestPay = Infinity;
  for (const candidate of chain) {
    const s = candidate.strike_price;
    let pay = 0;
    for (const r of chain) {
      const k = r.strike_price;
      if (s > k) pay += (s - k) * (r.ce?.oi ?? 0); // calls ITM
      if (k > s) pay += (k - s) * (r.pe?.oi ?? 0); // puts ITM
    }
    if (pay < bestPay) {
      bestPay = pay;
      best = s;
    }
  }
  return best;
}

/** Strike with the highest OI (or highest |session OI change|) on a side. */
export function extremeOi(
  chain: OptionChainData[],
  side: "ce" | "pe"
): { strike: number; oi: number } {
  let strike = 0;
  let oi = -Infinity;
  for (const r of chain) {
    const v = r[side]?.oi ?? 0;
    if (v > oi) {
      oi = v;
      strike = r.strike_price;
    }
  }
  return { strike, oi: oi === -Infinity ? 0 : oi };
}
