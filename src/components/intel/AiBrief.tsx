"use client";

import { useState } from "react";
import DataBadge from "./DataBadge";
import { biasClasses, biasLabel, momentumClasses, riskClasses } from "./style";
import { INTEL_CONFIG } from "@/config/intel";
import type { AiBrief as AiBriefType, BullBearPressure, IntelligenceScore } from "@/types/intel";

interface Props {
  aiBrief: AiBriefType;
  intelligenceScore: IntelligenceScore | null;
  bullBear: BullBearPressure | null;
}

function Tile({ label, value, valueClass = "text-white", hint }: { label: string; value: string; valueClass?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2" title={hint}>
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

/** The headline "AI Market Intelligence" read — what to do and why. Collapsible. */
export default function AiBrief({ aiBrief, intelligenceScore, bullBear }: Props) {
  const [open, setOpen] = useState(true);
  const L = INTEL_CONFIG.aiBrief.labels;
  const bc = biasClasses(aiBrief.bias);
  const risk = riskClasses(aiBrief.risk);

  const recClass =
    aiBrief.recommendationDirection === "long"
      ? "text-green-400"
      : aiBrief.recommendationDirection === "short"
        ? "text-red-400"
        : "text-gray-300";

  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${bc.bg}`}>
      <div className={`flex items-start justify-between gap-3 ${open ? "mb-4" : ""}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-start gap-2 text-left cursor-pointer"
        >
          <span className={`mt-1 text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`} aria-hidden>
            ▸
          </span>
          <span>
            <h2 className="text-lg font-bold text-white sm:text-xl">{L.title}</h2>
            <p className="mt-0.5 text-xs text-gray-400">{L.subtitle}</p>
          </span>
        </button>
        <DataBadge provenance="derived" />
      </div>

      {open && (
        <>
          {/* Bias + confidence + intelligence score */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="flex flex-col justify-between gap-3 lg:w-64 lg:border-r lg:border-white/10 lg:pr-6">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400">{L.bias}</div>
                <div className={`text-2xl font-bold ${bc.text}`}>{biasLabel(aiBrief.bias)}</div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                  <span>{L.confidence}</span>
                  <span className={`font-semibold ${bc.text}`}>{aiBrief.confidence}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                  <div className={`h-full rounded-full transition-all duration-500 ${bc.bar}`} style={{ width: `${aiBrief.confidence}%` }} />
                </div>
              </div>
              {intelligenceScore && (
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2" title={INTEL_CONFIG.intelligenceScore.labels.title}>
                  <span className="text-[11px] uppercase tracking-wide text-gray-400">Intel Score</span>
                  <span className="text-xl font-bold tabular-nums text-white">
                    {intelligenceScore.score}
                    <span className="ml-1 text-[11px] font-normal text-gray-400">/100</span>
                  </span>
                </div>
              )}
            </div>

            {/* Stat tiles */}
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Tile label={L.recommendation} value={aiBrief.recommendation} valueClass={recClass} />
                <Tile label={L.support} value={aiBrief.support != null ? String(aiBrief.support) : "—"} valueClass="text-green-400" />
                <Tile label={L.resistance} value={aiBrief.resistance != null ? String(aiBrief.resistance) : "—"} valueClass="text-red-400" />
                <Tile label={L.momentum} value={L.momentumLabels[aiBrief.momentum]} valueClass={momentumClasses(aiBrief.momentum)} />
                <Tile label={L.risk} value={L.riskLabels[aiBrief.risk]} valueClass={risk.text} />
                {bullBear && (
                  <Tile
                    label="Bull / Bear"
                    value={`${bullBear.bull} / ${bullBear.bear}`}
                    valueClass={bullBear.pressure === "bull-dominant" ? "text-green-400" : bullBear.pressure === "bear-dominant" ? "text-red-400" : "text-gray-300"}
                  />
                )}
              </div>

              {/* Why this signal */}
              <div className="mt-4">
                <div className="mb-1.5 text-xs font-medium text-gray-400">{L.why}</div>
                <ul className="space-y-1">
                  {aiBrief.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                      <span className={bc.text}>✓</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
