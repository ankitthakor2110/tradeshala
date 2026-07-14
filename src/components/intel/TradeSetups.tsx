"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import type { TradeSetup } from "@/types/intel";

function Level({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex-1">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

export default function TradeSetups({ setups, threshold }: { setups: TradeSetup[]; threshold: number }) {
  return (
    <Section
      title={INTEL_CONFIG.labels.setups}
      provenance="derived"
      subtitle={`Only shown above ${threshold}% confidence`}
    >
      {setups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-800/30 px-4 py-6 text-center text-sm text-gray-400">
          No setup clears the {threshold}% confidence bar right now — stay flat and wait.
        </div>
      ) : (
        <div className="space-y-3">
          {setups.map((s) => {
            const long = s.direction === "long";
            const accent = long ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5";
            const dirTone = long ? "text-green-400" : "text-red-400";
            return (
              <div key={s.id} className={`rounded-lg border p-3.5 ${accent}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${dirTone}`}>
                    {s.entryLabel} {s.trigger}
                  </span>
                  <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-semibold text-gray-200">
                    {s.confidence}% · RR {s.rr}
                  </span>
                </div>
                <div className="mt-3 flex gap-3">
                  <Level label="Stop" value={s.stop} tone="text-red-300" />
                  <Level label="Target 1" value={s.targets[0]} tone="text-green-300" />
                  <Level label="Target 2" value={s.targets[1]} tone="text-green-300" />
                </div>
                <p className="mt-2.5 text-xs text-gray-400">{s.reason}</p>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
