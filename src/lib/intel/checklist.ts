// Pre-trade checklist → READY_TO_BUY / READY_TO_SELL / WAIT. Each condition votes
// for a side (long/short) or abstains; the dominant side wins if it clears the
// minimum. Conditions with no feed yet (SMC, futures) are shown as N/A rather
// than faked. Pure — no DB / env / clock.

import type { ChecklistItem, ChecklistResult } from "@/types/intel";
import { INTEL_CONFIG } from "@/config/intel";

export interface ChecklistContext {
  ltp: number;
  vwap: number | null;
  trend: "bullish" | "bearish" | "neutral";
  pcr: number;
  openRangeHigh: number | null;
  openRangeLow: number | null;
  changePercent: number;
  maxPain: number;
  oiSkewScore: number | null;
  support: number;
  resistance: number;
}

type Side = "long" | "short" | null;

function vote(
  key: string,
  label: string,
  favors: Side,
  detail: string
): { key: string; label: string; favors: Side; detail: string } {
  return { key, label, favors, detail };
}

export function evaluateChecklist(ctx: ChecklistContext): ChecklistResult {
  const { pcrBullish, pcrBearish } = INTEL_CONFIG.sentiment;
  const raw: { key: string; label: string; favors: Side; detail: string }[] = [];

  // VWAP
  if (ctx.vwap == null) {
    raw.push(vote("vwap", "VWAP position", null, "VWAP unavailable"));
  } else {
    const long = ctx.ltp > ctx.vwap;
    raw.push(
      vote("vwap", long ? "Above VWAP" : "Below VWAP", long ? "long" : "short", `LTP vs VWAP ${ctx.vwap}`)
    );
  }

  // Trend
  raw.push(
    vote(
      "trend",
      `Trend ${ctx.trend}`,
      ctx.trend === "bullish" ? "long" : ctx.trend === "bearish" ? "short" : null,
      "Price-action trend"
    )
  );

  // PCR
  raw.push(
    vote(
      "pcr",
      "PCR bias",
      ctx.pcr >= pcrBullish ? "long" : ctx.pcr > 0 && ctx.pcr <= pcrBearish ? "short" : null,
      `PCR ${ctx.pcr.toFixed(2)}`
    )
  );

  // Opening-range breakout
  let orSide: Side = null;
  if (ctx.openRangeHigh != null && ctx.ltp > ctx.openRangeHigh) orSide = "long";
  else if (ctx.openRangeLow != null && ctx.ltp < ctx.openRangeLow) orSide = "short";
  raw.push(vote("or", "Opening-range breakout", orSide, "LTP vs first 15-min range"));

  // Momentum
  raw.push(
    vote(
      "momentum",
      "Day momentum",
      ctx.changePercent > 0.1 ? "long" : ctx.changePercent < -0.1 ? "short" : null,
      `${ctx.changePercent >= 0 ? "+" : ""}${ctx.changePercent.toFixed(2)}%`
    )
  );

  // Max pain magnet
  raw.push(
    vote(
      "maxpain",
      "Vs max pain",
      ctx.ltp > ctx.maxPain ? "long" : ctx.ltp < ctx.maxPain ? "short" : null,
      `Max pain ${ctx.maxPain}`
    )
  );

  // Session OI flow
  raw.push(
    vote(
      "oiflow",
      "OI flow",
      ctx.oiSkewScore == null || Math.abs(ctx.oiSkewScore) < 0.05
        ? null
        : ctx.oiSkewScore > 0
          ? "long"
          : "short",
      ctx.oiSkewScore == null ? "Warming up" : "Fresh writing skew"
    )
  );

  // OI wall proximity (defended level)
  let wallSide: Side = null;
  const nearSupport = ctx.support > 0 && Math.abs(ctx.ltp - ctx.support) / ctx.ltp < 0.003 && ctx.ltp >= ctx.support;
  const nearResistance =
    ctx.resistance > 0 && Math.abs(ctx.ltp - ctx.resistance) / ctx.ltp < 0.003 && ctx.ltp <= ctx.resistance;
  if (nearSupport) wallSide = "long";
  else if (nearResistance) wallSide = "short";
  raw.push(vote("wall", "At defended OI wall", wallSide, `Support ${ctx.support} / Resistance ${ctx.resistance}`));

  const longScore = raw.filter((r) => r.favors === "long").length;
  const shortScore = raw.filter((r) => r.favors === "short").length;
  const applicable = raw.filter((r) => r.favors !== null).length;

  const { minReady } = INTEL_CONFIG.checklist;
  const verdict: ChecklistResult["verdict"] =
    longScore >= minReady && longScore > shortScore
      ? "READY_TO_BUY"
      : shortScore >= minReady && shortScore > longScore
        ? "READY_TO_SELL"
        : "WAIT";

  // Colour each row against the leading side (even when it's below the READY
  // threshold), so a WAIT still shows which way the evidence leans.
  const leadingSide: Side = longScore > shortScore ? "long" : shortScore > longScore ? "short" : null;

  const items: ChecklistItem[] = raw.map((r) => ({
    key: r.key,
    label: r.label,
    favors: r.favors,
    detail: r.detail,
    state: r.favors === null ? "na" : leadingSide != null && r.favors === leadingSide ? "pass" : "fail",
  }));

  // Append the honest "no feed / next phase" rows as N/A.
  for (const u of INTEL_CONFIG.checklist.unavailable) {
    items.push({ key: u.key, label: u.label, favors: null, detail: u.detail, state: "na" });
  }

  return { items, longScore, shortScore, applicable, verdict };
}
