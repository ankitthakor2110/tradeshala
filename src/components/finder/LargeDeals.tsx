"use client";

import { useState } from "react";
import DataBadge from "@/components/intel/DataBadge";
import Skeleton from "@/components/ui/Skeleton";
import { filterDeals } from "@/lib/finder/deals";
import { FINDER_CONFIG } from "@/config/finder";
import { formatOI } from "@/utils/format";
import type { DealType, DealSide, LargeDeal } from "@/types/finder";

const C = FINDER_CONFIG.largeDeals;

function SidePill({ side }: { side: DealSide | null }) {
  if (!side) return <span className="text-gray-600">—</span>;
  const buy = side === "BUY";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        buy ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"
      }`}
    >
      {side}
    </span>
  );
}

export default function LargeDeals({
  deals,
  asOn,
  source,
  loading,
}: {
  deals: LargeDeal[];
  asOn: string | null;
  source: "nse" | "unavailable";
  loading: boolean;
}) {
  const [tab, setTab] = useState<DealType>("bulk");
  const [side, setSide] = useState<DealSide | "all">("all");
  const [query, setQuery] = useState("");

  const rows = filterDeals(deals, { dealType: tab, side, query });
  const unavailable = !loading && source === "unavailable";

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white sm:text-base">{C.title}</h2>
            <DataBadge provenance={source === "nse" ? "live" : "none"} />
            {asOn && <span className="text-xs text-gray-500">as on {asOn}</span>}
          </div>
          <p className="mt-0.5 max-w-2xl text-xs text-gray-500">{C.subtitle}</p>
        </div>
      </div>

      {/* Deal-type tabs */}
      <div className="flex flex-wrap items-center gap-1.5">
        {C.tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              title={t.hint}
              onClick={() => setTab(t.key)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-all active:scale-95 ${
                active
                  ? "border-violet-500 bg-violet-500/15 text-violet-300"
                  : "border-gray-700 bg-gray-800/60 text-gray-400 hover:border-violet-500/50 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <select
            value={side}
            onChange={(e) => setSide(e.target.value as DealSide | "all")}
            className="cursor-pointer rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            {C.sides.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={C.searchPlaceholder}
            className="w-52 cursor-text rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 transition-all placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </div>
      </div>

      {loading ? (
        <Skeleton variant="card" className="h-64" />
      ) : unavailable ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-sm text-gray-400">
          {C.emptyUnavailable}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-sm text-gray-400">
          {C.empty}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/60">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                {C.columns.map((h, i) => (
                  <th key={h} className={`px-4 py-3 font-medium ${i >= 2 ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={`${d.symbol}-${d.clientName}-${i}`} className="border-b border-gray-800/60 hover:bg-gray-800/40">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-white">{d.symbol}</span>
                    <span className="ml-2 text-xs text-gray-500">{d.name}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-300">{d.clientName}</td>
                  <td className="px-4 py-3 text-right">
                    <SidePill side={d.side} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-300">{formatOI(d.qty)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                    {d.watp != null ? `₹${d.watp.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-500">{d.date || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-600">{C.note}</p>
    </section>
  );
}
