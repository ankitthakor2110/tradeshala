"use client";

import DataBadge from "./DataBadge";
import { biasClasses, biasLabel } from "./style";
import { formatIndianCurrency, formatPercent, timeAgo } from "@/utils/format";
import { getPnLColor } from "@/utils/colors";
import type { MarketOverview, SentimentScore, Verdict } from "@/types/intel";

interface Props {
  verdict: Verdict;
  sentiment: SentimentScore;
  overview: MarketOverview;
  warmingUp: boolean;
  lastUpdated: string | null;
  isLive: boolean;
}

export default function VerdictHero({ verdict, sentiment, overview, warmingUp, lastUpdated, isLive }: Props) {
  const bc = biasClasses(verdict.bias);
  const controlLabel =
    verdict.control === "buyers" ? "BUYERS" : verdict.control === "sellers" ? "SELLERS" : "NEITHER SIDE";

  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${bc.bg}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
        {/* Spot glance */}
        <div className="flex flex-col justify-between gap-2 lg:w-56 lg:border-r lg:border-white/10 lg:pr-6">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">NIFTY 50</span>
            <DataBadge provenance={isLive ? "live" : "derived"} />
          </div>
          <div>
            <div className="text-3xl font-bold text-white tabular-nums">
              {overview.ltp ? overview.ltp.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
            </div>
            <div className={`text-sm font-semibold ${getPnLColor(overview.change)}`}>
              {formatIndianCurrency(overview.change, { sign: true })} ({formatPercent(overview.changePercent, { sign: true })})
            </div>
          </div>
          <div className="text-xs text-gray-500">
            {overview.marketOpen ? "Market open" : "Market closed"}
            {lastUpdated && <> · {timeAgo(lastUpdated)}</>}
          </div>
        </div>

        {/* The verdict */}
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">{verdict.headline}</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${bc.bg} ${bc.text}`}>
              {biasLabel(verdict.bias)}
            </span>
          </div>

          <p className="mt-1.5 text-sm text-gray-300">
            Control: <span className={`font-semibold ${bc.text}`}>{controlLabel}</span> · {verdict.summary}
          </p>

          {/* Confidence meter */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
              <span>Conviction</span>
              <span className={`font-semibold ${bc.text}`}>{verdict.confidence}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${bc.bar}`}
                style={{ width: `${verdict.confidence}%` }}
              />
            </div>
          </div>

          {/* Bull / neutral / bear split */}
          <div className="mt-3">
            <div className="flex h-2.5 overflow-hidden rounded-full">
              <div className="bg-green-500 transition-all duration-500" style={{ width: `${sentiment.bull}%` }} />
              <div className="bg-gray-600 transition-all duration-500" style={{ width: `${sentiment.neutral}%` }} />
              <div className="bg-red-500 transition-all duration-500" style={{ width: `${sentiment.bear}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px]">
              <span className="text-green-400">Bull {sentiment.bull}%</span>
              <span className="text-gray-400">Neutral {sentiment.neutral}%</span>
              <span className="text-red-400">Bear {sentiment.bear}%</span>
            </div>
          </div>

          {verdict.trap && verdict.trapNote && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <span className="text-amber-400">⚠</span>
              <span className="text-sm text-amber-200">{verdict.trapNote}</span>
            </div>
          )}

          {warmingUp && (
            <p className="mt-3 text-xs text-gray-500">
              Warming up — OI-flow signals sharpen after the next refresh.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
