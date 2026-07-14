"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import { getPnLColor } from "@/utils/colors";
import { formatPercent } from "@/utils/format";
import type { MarketOverview as MO } from "@/types/intel";

function num(n: number | null, digits = 2): string {
  return n == null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${tone ?? "text-white"}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

export default function MarketOverview({ overview }: { overview: MO }) {
  const o = overview;
  const trendTone =
    o.trend === "bullish" ? "text-green-400" : o.trend === "bearish" ? "text-red-400" : "text-gray-300";
  const gapTone =
    o.gapType === "gap-up" ? "text-green-400" : o.gapType === "gap-down" ? "text-red-400" : "text-gray-300";

  return (
    <Section title={INTEL_CONFIG.labels.overview} provenance="derived" subtitle="Live spot + candle-derived levels">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <Tile
          label="Trend"
          value={o.trend.charAt(0).toUpperCase() + o.trend.slice(1)}
          sub={`${o.trendConfidence}% confidence`}
          tone={trendTone}
        />
        <Tile
          label="Gap"
          value={o.gapType === "flat" ? "Flat" : `${num(o.gap)} (${formatPercent(o.gapPercent, { sign: true })})`}
          sub={o.gapType === "gap-up" ? "Gap up" : o.gapType === "gap-down" ? "Gap down" : "vs prev close"}
          tone={gapTone}
        />
        <Tile
          label="VWAP"
          value={num(o.vwap)}
          sub={o.vwapReliable ? "volume-weighted" : "approx (no volume)"}
          tone={o.vwap != null && o.ltp > o.vwap ? "text-green-400" : "text-red-400"}
        />
        <Tile
          label="Dist. from VWAP"
          value={o.distanceFromVwapPct == null ? "—" : formatPercent(o.distanceFromVwapPct, { sign: true })}
          tone={getPnLColor(o.distanceFromVwapPct ?? 0)}
        />
        <Tile label="Day High" value={num(o.dayHigh)} tone="text-green-300" />
        <Tile label="Day Low" value={num(o.dayLow)} tone="text-red-300" />
        <Tile label="Open Range High" value={num(o.openRangeHigh)} sub="first 15 min" />
        <Tile label="Open Range Low" value={num(o.openRangeLow)} sub="first 15 min" />
        <Tile label="Open" value={num(o.open)} />
        <Tile label="Prev Close" value={num(o.prevClose)} />
        <Tile label="ATR" value={num(o.atr)} sub="14-period" />
        <Tile label="Day Range" value={num(o.dayRange)} sub="high − low" />
        {/* Honest NO-FEED chips: need historical daily candles the feed lacks. */}
        <Tile label="Prev Day High" value="—" sub="no daily feed" tone="text-gray-500" />
        <Tile label="Prev Day Low" value="—" sub="no daily feed" tone="text-gray-500" />
        <Tile label="Avg Daily Range" value="—" sub="no daily feed" tone="text-gray-500" />
      </div>
    </Section>
  );
}
