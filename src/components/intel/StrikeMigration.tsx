"use client";

import Section from "./Section";
import { toneAccent, toneText } from "./style";
import { INTEL_CONFIG } from "@/config/intel";
import type { StrikeMigration as StrikeMigrationType, StrikeShift } from "@/types/intel";

function ShiftPill({ shift }: { shift: StrikeShift }) {
  const S = INTEL_CONFIG.migration.labels.shift;
  const cls =
    shift === "higher" ? "text-green-400 bg-green-500/10" : shift === "lower" ? "text-red-400 bg-red-500/10" : "text-gray-400 bg-gray-500/10";
  const arrow = shift === "higher" ? "↑" : shift === "lower" ? "↓" : "→";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{arrow} {S[shift]}</span>;
}

function Row({ prevLabel, prevVal, currLabel, currVal, shift }: { prevLabel: string; prevVal: number | null; currLabel: string; currVal: number | null; shift: StrikeShift }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2">
      <div className="flex items-center justify-between text-sm tabular-nums">
        <span className="text-gray-400">
          <span className="text-[11px] text-gray-500">{prevLabel}</span> {prevVal ?? "—"}
        </span>
        <span className="text-gray-600">→</span>
        <span className="font-semibold text-white">
          {currVal ?? "—"} <span className="text-[11px] font-normal text-gray-500">{currLabel}</span>
        </span>
        <ShiftPill shift={shift} />
      </div>
    </div>
  );
}

export default function StrikeMigration({ migration }: { migration: StrikeMigrationType | null }) {
  const L = INTEL_CONFIG.migration.labels;
  const insufficient = !migration || migration.insufficient;

  return (
    <Section title={L.title} subtitle={L.subtitle} provenance="derived" collapsible>
      {insufficient ? (
        <p className="text-xs text-gray-500">{INTEL_CONFIG.insufficientData}</p>
      ) : (
        <div className="space-y-2">
          <Row prevLabel={L.prevSupport} prevVal={migration!.prevSupport} currLabel={L.currSupport} currVal={migration!.currSupport} shift={migration!.supportShift} />
          <Row prevLabel={L.prevResistance} prevVal={migration!.prevResistance} currLabel={L.currResistance} currVal={migration!.currResistance} shift={migration!.resistanceShift} />
          <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${toneAccent(migration!.tone)} ${toneText(migration!.tone)}`}>
            {migration!.interpretation}
          </div>
        </div>
      )}
    </Section>
  );
}
