"use client";

import Section from "./Section";
import type { BullBearPressure } from "@/types/intel";

export default function BullBearScore({ bullBear }: { bullBear: BullBearPressure | null }) {
  if (!bullBear) return null;

  const { bull, bear, pressure } = bullBear;
  const label =
    pressure === "bull-dominant" ? "Bull Dominant" : pressure === "bear-dominant" ? "Bear Dominant" : "Balanced";
  const labelClass =
    pressure === "bull-dominant" ? "text-green-400" : pressure === "bear-dominant" ? "text-red-400" : "text-gray-300";

  return (
    <Section title="Bull vs Bear Score" subtitle="Directional pressure balance" provenance="derived" collapsible>
      <div className="mb-3 flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2">
        <span className="text-xs text-gray-400">Overall pressure</span>
        <span className={`text-sm font-bold ${labelClass}`}>{label}</span>
      </div>

      {/* Opposed gauge */}
      <div className="flex items-center gap-2">
        <span className="w-9 text-right text-xs font-semibold tabular-nums text-green-400">{bull}</span>
        <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-gray-800">
          <div className="bg-green-500 transition-all duration-500" style={{ width: `${bull}%` }} />
          <div className="ml-auto bg-red-500 transition-all duration-500" style={{ width: `${bear}%` }} />
        </div>
        <span className="w-9 text-xs font-semibold tabular-nums text-red-400">{bear}</span>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-gray-500">
        <span>Bull {bull}/100</span>
        <span>Bear {bear}/100</span>
      </div>
    </Section>
  );
}
