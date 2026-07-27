// Trade-readiness gauge: a weighted go / no-go across the desk checklist
// (writing, PCR, premium behaviour, OI change, volume, strike migration, price
// action, support holding, resistance break). Each condition votes long/short or
// abstains; readiness = how much weight the leading side has out of the total, so
// missing / neutral confirmations honestly LOWER readiness. Pure — no DB/env/clock.

import type { InsightTone, ReadinessFactor, TradeReadiness, WriterWinner } from "@/types/intel";
import { INTEL_CONFIG } from "@/config/intel";

type Side = "long" | "short" | null;

export interface ReadinessContext {
  writerWinner: WriterWinner | null;
  pcr: number;
  premiumTone: InsightTone; // from premium behaviour
  oiSkewScore: number | null;
  ceVolume: number; // near-ATM aggregate
  peVolume: number;
  migrationTone: InsightTone; // from strike migration
  ltp: number;
  vwap: number | null;
  changePercent: number;
  support: number;
  resistance: number;
}

function toneSide(tone: InsightTone): Side {
  return tone === "bullish" ? "long" : tone === "bearish" ? "short" : null;
}

export function calculateTradeReadiness(ctx: ReadinessContext): TradeReadiness {
  const cfg = INTEL_CONFIG.readiness;
  const w = cfg.weights;
  const { pcrBullish, pcrBearish } = INTEL_CONFIG.sentiment;

  const near = (a: number, b: number, pct: number) => b > 0 && Math.abs(a - b) / b < pct;

  // Volume confirms the move only when the dominant-volume leg matches direction.
  let volumeSide: Side = null;
  if (ctx.changePercent > 0.1 && ctx.ceVolume > ctx.peVolume) volumeSide = "long";
  else if (ctx.changePercent < -0.1 && ctx.peVolume > ctx.ceVolume) volumeSide = "short";

  // Price action: side of VWAP + day direction agree.
  let priceSide: Side = null;
  if (ctx.vwap != null && ctx.ltp > ctx.vwap && ctx.changePercent > 0.05) priceSide = "long";
  else if (ctx.vwap != null && ctx.ltp < ctx.vwap && ctx.changePercent < -0.05) priceSide = "short";

  // Support holding vs broken.
  let supportSide: Side = null;
  if (ctx.support > 0) {
    if (ctx.ltp < ctx.support) supportSide = "short"; // support broken
    else if (near(ctx.ltp, ctx.support, 0.004)) supportSide = "long"; // holding just above
  }

  // Resistance break vs rejection.
  let resistanceSide: Side = null;
  if (ctx.resistance > 0) {
    if (ctx.ltp > ctx.resistance) resistanceSide = "long"; // broke the call wall
    else if (near(ctx.ltp, ctx.resistance, 0.004)) resistanceSide = "short"; // rejected at wall
  }

  const raw: { key: string; label: string; weight: number; favors: Side; detail: string }[] = [
    {
      key: "writing",
      label: "Writer control",
      weight: w.writing,
      favors: ctx.writerWinner === "put" ? "long" : ctx.writerWinner === "call" ? "short" : null,
      detail: ctx.writerWinner ? `${ctx.writerWinner} writers ahead` : "two-sided",
    },
    {
      key: "pcr",
      label: "PCR bias",
      weight: w.pcr,
      favors: ctx.pcr >= pcrBullish ? "long" : ctx.pcr > 0 && ctx.pcr <= pcrBearish ? "short" : null,
      detail: `PCR ${ctx.pcr.toFixed(2)}`,
    },
    {
      key: "premium",
      label: "Premium behaviour",
      weight: w.premium,
      favors: toneSide(ctx.premiumTone),
      detail: "ATM premium read",
    },
    {
      key: "oiChange",
      label: "OI change",
      weight: w.oiChange,
      favors:
        ctx.oiSkewScore == null || Math.abs(ctx.oiSkewScore) < 0.05
          ? null
          : ctx.oiSkewScore > 0
            ? "long"
            : "short",
      detail: ctx.oiSkewScore == null ? "warming up" : "fresh-writing skew",
    },
    { key: "volume", label: "Volume confirms", weight: w.volume, favors: volumeSide, detail: "CE vs PE volume vs move" },
    { key: "migration", label: "Strike migration", weight: w.migration, favors: toneSide(ctx.migrationTone), detail: "defended-level shift" },
    { key: "priceAction", label: "Price action", weight: w.priceAction, favors: priceSide, detail: "VWAP + day trend" },
    { key: "supportHolding", label: "Support holding", weight: w.supportHolding, favors: supportSide, detail: `Support ${ctx.support}` },
    { key: "resistanceBreak", label: "Resistance break", weight: w.resistanceBreak, favors: resistanceSide, detail: `Resistance ${ctx.resistance}` },
  ];

  let longW = 0;
  let shortW = 0;
  let totalW = 0;
  for (const r of raw) {
    totalW += r.weight;
    if (r.favors === "long") longW += r.weight;
    else if (r.favors === "short") shortW += r.weight;
  }

  const leadW = Math.max(longW, shortW);
  const direction: TradeReadiness["direction"] = longW > shortW ? "long" : shortW > longW ? "short" : "none";
  const score = totalW > 0 ? Math.round((leadW / totalW) * 100) : 0;

  const label =
    score >= cfg.minReady ? cfg.labels.ready : score >= cfg.caution ? cfg.labels.caution : cfg.labels.avoid;

  const factors: ReadinessFactor[] = raw.map((r) => ({
    key: r.key,
    label: r.label,
    favors: r.favors,
    detail: r.detail,
    state: r.favors === null ? "na" : direction !== "none" && r.favors === direction ? "pass" : "fail",
  }));

  return { score, label, direction, factors };
}
