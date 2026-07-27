"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import type { WriterConfidence } from "@/types/intel";

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="font-semibold text-gray-200 tabular-nums">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-800">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function WriterIntelligence({ writers }: { writers: WriterConfidence | null }) {
  const L = INTEL_CONFIG.writers.labels;
  const insufficient = !writers || writers.insufficient || writers.putConfidence == null;

  const winnerText =
    writers?.winner === "put" ? L.winnerPut : writers?.winner === "call" ? L.winnerCall : L.balanced;
  const winnerClass =
    writers?.winner === "put" ? "text-green-400" : writers?.winner === "call" ? "text-red-400" : "text-gray-300";

  return (
    <Section title={L.title} subtitle={L.subtitle} provenance="derived" collapsible>
      {insufficient ? (
        <p className="text-xs text-gray-500">{INTEL_CONFIG.insufficientData}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2">
            <span className="text-xs text-gray-400">Winner</span>
            <span className={`text-sm font-bold ${winnerClass}`}>{winnerText}</span>
          </div>
          <Bar label={L.put} value={writers!.putConfidence!} color="bg-green-500" />
          <Bar label={L.call} value={writers!.callConfidence!} color="bg-red-500" />
          <div className="rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2 text-xs text-gray-300">
            <span className="text-gray-500">Reason: </span>
            {writers!.reason}
          </div>
        </div>
      )}
    </Section>
  );
}
