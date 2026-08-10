"use client";

import Link from "next/link";
import DataBadge from "@/components/intel/DataBadge";
import Skeleton from "@/components/ui/Skeleton";
import { useIndexIntel, type IndexIntelRow, type IndexBias } from "@/hooks/useIndexIntel";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { FINDER_CONFIG } from "@/config/finder";
import { INTEL_CONFIG } from "@/config/intel";

const SUPPORTED_INDEX_KEYS = INTEL_CONFIG.symbols.map((s) => s.key);

const BIAS_STYLE: Record<IndexBias, string> = {
  bullish: "text-green-400 bg-green-500/10 border-green-500/20",
  bearish: "text-red-400 bg-red-500/10 border-red-500/20",
  neutral: "text-gray-400 bg-gray-500/10 border-gray-500/20",
};
const BIAS_LABEL: Record<IndexBias, string> = {
  bullish: "Put writers in control",
  bearish: "Call writers in control",
  neutral: "Balanced",
};

const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-sm font-medium tabular-nums text-gray-200">{value}</p>
    </div>
  );
}

function IntelCard({ row, topPick }: { row: IndexIntelRow; topPick: boolean }) {
  // Mock chain ⇒ no live feed: show the shell, never fabricated positioning.
  if (row.source === "mock") {
    return (
      <div className="rounded-xl border border-dashed border-gray-700 bg-gray-800/30 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold text-white">{row.label}</span>
          <DataBadge provenance="none" />
        </div>
        <p className="text-xs text-gray-500">No live option chain right now.</p>
      </div>
    );
  }

  return (
    <Link
      href={`/dashboard/intel?symbol=${row.key}`}
      className={`relative block rounded-xl border p-4 ${
        topPick ? "border-violet-500/50 bg-violet-500/[0.06]" : "border-gray-800 bg-gray-900/60"
      } ${INTERACTION_CLASSES.clickableCard}`}
    >
      {topPick && (
        <span className="absolute -top-2 right-3 rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          Top pick
        </span>
      )}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="font-semibold text-white">{row.label}</span>
          <span className="ml-2 text-sm tabular-nums text-gray-400">{num(row.underlying)}</span>
        </div>
        <DataBadge provenance="live" />
      </div>

      <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
        <span className="font-semibold text-violet-300">Conviction {row.conviction.score}</span>
        <span className="capitalize">· {row.conviction.label} {row.conviction.direction}</span>
      </div>

      <span
        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${BIAS_STYLE[row.bias]}`}
      >
        {BIAS_LABEL[row.bias]} · PCR {row.pcr.toFixed(2)}
      </span>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Support" value={num(row.support)} />
        <Stat label="Resistance" value={num(row.resistance)} />
        <Stat label="Max Pain" value={num(row.maxPain)} />
      </div>

      <p className="mt-3 text-xs font-medium text-violet-400">Open full intel →</p>
    </Link>
  );
}

/** Compact positioning snapshot per index; deep-links into the full intel page. */
export default function IndexIntel() {
  const { rows, loading } = useIndexIntel();

  // Crown the highest-conviction LIVE index (rows are pre-sorted real-first),
  // but only when its conviction is at least moderate — never crown a weak read.
  const topPickKey = rows.find((r) => r.source !== "mock" && r.conviction.score >= 33)?.key ?? null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white sm:text-base">Index Intelligence</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Live option-chain positioning for the F&amp;O indices — PCR, bias and the OI-defended levels. DERIVED
          from live chains; the full engine (control, readiness, score) is one click away.
        </p>
      </div>

      {loading && rows.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SUPPORTED_INDEX_KEYS.map((k) => (
            <Skeleton key={k} variant="card" className="h-40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => (
            <IntelCard key={r.key} row={r} topPick={r.key === topPickKey} />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-600">{FINDER_CONFIG.disclaimer}</p>
    </section>
  );
}
