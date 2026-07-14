"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import { toneText } from "./style";
import { formatOI } from "@/utils/format";
import type { OiAnalysis as OI } from "@/types/intel";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${tone ?? "text-white"}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

export default function OiAnalysis({ oi, warmingUp }: { oi: OI; warmingUp: boolean }) {
  const pcrTone = oi.pcr >= 1.15 ? "text-green-400" : oi.pcr <= 0.8 ? "text-red-400" : "text-gray-300";
  return (
    <Section
      title={INTEL_CONFIG.labels.oi}
      provenance="live"
      subtitle="OI walls & PCR from the live chain; ΔOI is session-derived"
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat label="PCR" value={oi.pcr.toFixed(2)} sub={oi.pcr >= 1.15 ? "put-heavy · bullish" : oi.pcr <= 0.8 ? "call-heavy · bearish" : "balanced"} tone={pcrTone} />
        <Stat label="Max Pain" value={String(oi.maxPain)} sub="OI gravity" tone="text-violet-300" />
        <Stat label="Resistance" value={String(oi.resistance)} sub={`Max call OI · ${formatOI(oi.maxCallOi)}`} tone="text-red-300" />
        <Stat label="Support" value={String(oi.support)} sub={`Max put OI · ${formatOI(oi.maxPutOi)}`} tone="text-green-300" />
        <Stat
          label="Top Call ΔOI"
          value={warmingUp ? "—" : oi.highestCallOiChangeStrike ? String(oi.highestCallOiChangeStrike) : "—"}
          sub={warmingUp ? "warming up" : "biggest call add"}
          tone="text-red-300"
        />
        <Stat
          label="Top Put ΔOI"
          value={warmingUp ? "—" : oi.highestPutOiChangeStrike ? String(oi.highestPutOiChangeStrike) : "—"}
          sub={warmingUp ? "warming up" : "biggest put add"}
          tone="text-green-300"
        />
      </div>

      <div className="mt-4 space-y-2">
        {oi.signals.map((s, i) => (
          <div key={i} className="rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2">
            <div className={`text-xs font-semibold ${toneText(s.tone)}`}>{s.label}</div>
            <div className="text-[11px] text-gray-400">{s.explanation}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}
