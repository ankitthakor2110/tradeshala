"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import type { ReadinessFactor, TradeReadiness as TradeReadinessType } from "@/types/intel";

function StateIcon({ state, favors }: { state: ReadinessFactor["state"]; favors: ReadinessFactor["favors"] }) {
  if (state === "na") return <span className="text-gray-600">–</span>;
  if (state === "pass") return <span className={favors === "short" ? "text-red-400" : "text-green-400"}>✓</span>;
  return <span className="text-gray-600">·</span>;
}

export default function TradeReadiness({ readiness }: { readiness: TradeReadinessType | null }) {
  const L = INTEL_CONFIG.readiness.labels;
  if (!readiness) {
    return (
      <Section title={L.title} subtitle={L.subtitle} provenance="derived" collapsible>
        <p className="text-xs text-gray-500">{INTEL_CONFIG.insufficientData}</p>
      </Section>
    );
  }

  const { score, label, direction, factors } = readiness;
  const ready = score >= INTEL_CONFIG.readiness.minReady;
  const caution = score >= INTEL_CONFIG.readiness.caution && !ready;
  const barColor = ready ? "bg-green-500" : caution ? "bg-amber-500" : "bg-red-500";
  const scoreColor = ready ? "text-green-400" : caution ? "text-amber-400" : "text-red-400";

  return (
    <Section title={L.title} subtitle={L.subtitle} provenance="derived" collapsible>
      <div className="mb-3">
        <div className="mb-1 flex items-end justify-between">
          <span className={`text-2xl font-bold tabular-nums ${scoreColor}`}>
            {score}
            <span className="ml-1 text-xs font-normal text-gray-500">%</span>
          </span>
          <span className={`text-sm font-semibold ${scoreColor}`}>{label}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-800">
          <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${score}%` }} />
        </div>
        {direction !== "none" && (
          <div className="mt-1 text-[11px] text-gray-500">Leaning {direction === "long" ? "long / CE" : "short / PE"}</div>
        )}
      </div>

      <ul className="space-y-1">
        {factors.map((f) => (
          <li key={f.key} className="flex items-center justify-between gap-2 text-xs" title={f.detail}>
            <span className="flex items-center gap-2 text-gray-300">
              <StateIcon state={f.state} favors={f.favors} />
              {f.label}
            </span>
            <span className="text-gray-500">{f.state === "na" ? "n/a" : f.favors ?? "—"}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
