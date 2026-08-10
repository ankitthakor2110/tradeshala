"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FINDER_CONFIG } from "@/config/finder";
import { deriveRowSignals } from "@/lib/finder/screener";
import { equityConviction, type ConvictionLabel } from "@/lib/finder/rank";
import { getPnLColor } from "@/utils/colors";
import { formatOI, formatPercent, formatIndianCurrency } from "@/utils/format";
import type { ScreenerRow, ScreenerSortKey } from "@/types/finder";
import type { FinderConfigState } from "@/hooks/useScreener";

interface ScreenerTableProps {
  rows: ScreenerRow[];
  config: FinderConfigState;
  setConfig: (patch: Partial<FinderConfigState>) => void;
  /** Symbols with an NSE bulk/block deal today — cross-tagged in the table. */
  dealSymbols?: Set<string>;
}

const CONVICTION_STYLE: Record<ConvictionLabel, string> = {
  strong: "text-green-400 bg-green-500/10 border-green-500/20",
  moderate: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  weak: "text-gray-400 bg-gray-500/10 border-gray-500/20",
};

/** Conviction pill: 0-100 score, band-coloured, with the direction arrow. */
function ConvictionPill({ row }: { row: ScreenerRow }) {
  const c = equityConviction(row);
  const arrow = c.direction === "long" ? "▲" : c.direction === "short" ? "▼" : "•";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${CONVICTION_STYLE[c.label]}`}
      title={`${c.label} ${c.direction} conviction`}
    >
      {arrow} {c.score}
    </span>
  );
}

/** Small horizontal gauge of where LTP sits inside the session range. */
function RangeGauge({ pos }: { pos: number | null }) {
  if (pos == null) return <span className="text-gray-600">—</span>;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="relative h-1.5 w-16 rounded-full bg-gray-700">
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-400"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs text-gray-400">{Math.round(pos * 100)}%</span>
    </div>
  );
}

export default function ScreenerTable({ rows, config, setConfig, dealSymbols }: ScreenerTableProps) {
  const router = useRouter();

  // Deep-link to the Trade ticket with this stock's option chain open. Every
  // finder name is F&O, so we always land on the CE side ready to trade.
  const tradeHref = (r: ScreenerRow) => {
    const name = FINDER_CONFIG.universe.find((u) => u.symbol === r.symbol)?.name ?? r.symbol;
    const q = new URLSearchParams({ symbol: r.symbol, name, exchange: r.exchange, type: "CE" });
    return `/dashboard/trade?${q.toString()}`;
  };

  // A header click sorts by that column; toggles direction if already active.
  // Switches to the "all" preset so the manual sort actually takes effect
  // (gainers/losers/high-volume presets impose their own ordering).
  const onSort = (key: ScreenerSortKey) => {
    const active = config.sortKey === key;
    const dir = active && config.sortDir === "desc" ? "asc" : "desc";
    setConfig({ sortKey: key, sortDir: dir, preset: "all" });
  };

  const indicator = (key: ScreenerSortKey) =>
    config.preset === "all" && config.sortKey === key ? (config.sortDir === "desc" ? " ▼" : " ▲") : "";

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-400">
        No symbols match this filter.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/60">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-xs text-gray-500">
            {FINDER_CONFIG.columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-3 font-medium ${c.numeric ? "text-right" : "text-left"}`}
              >
                <button
                  type="button"
                  onClick={() => onSort(c.key)}
                  className="cursor-pointer transition-colors hover:text-violet-300 active:opacity-70"
                >
                  {c.label}
                  <span className="text-violet-400">{indicator(c.key)}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const sig = deriveRowSignals(r);
            return (
              <tr
                key={r.symbol}
                onClick={() => router.push(tradeHref(r))}
                title={`Trade ${r.symbol} options`}
                className="group cursor-pointer border-b border-gray-800/60 transition-colors hover:bg-gray-800/40"
              >
                <td className="px-4 py-3">
                  <Link
                    href={tradeHref(r)}
                    title={`Trade ${r.symbol} options`}
                    onClick={(e) => e.stopPropagation()}
                    className="cursor-pointer font-semibold text-white transition-colors group-hover:text-violet-300"
                  >
                    {r.symbol}
                  </Link>
                  <span className="ml-2 text-xs text-gray-600">{r.exchange}</span>
                  {dealSymbols?.has(r.symbol) && (
                    <span
                      title={FINDER_CONFIG.largeDeals.dealTagHint}
                      className="ml-2 rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300"
                    >
                      {FINDER_CONFIG.largeDeals.dealTagLabel}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-200">
                  {formatIndianCurrency(r.last_price)}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-medium ${getPnLColor(r.change_percent)}`}>
                  {formatPercent(r.change_percent, { sign: true })}
                </td>
                <td className="px-4 py-3 text-right">
                  <ConvictionPill row={r} />
                </td>
                <td className="px-4 py-3">
                  <RangeGauge pos={sig.dayRangePos} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-400">
                  {r.volume > 0 ? formatOI(r.volume) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
