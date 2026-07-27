"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import type { InstitutionalFlow as InstitutionalFlowType } from "@/types/intel";

export default function InstitutionalFlow({ flow }: { flow: InstitutionalFlowType | null }) {
  const L = INTEL_CONFIG.institutionalFlow.labels;
  const insufficient = !flow || flow.insufficient;

  const who = flow ? L.controllers[flow.controlledBy] : "—";
  const whoClass =
    flow?.controlledBy === "put-writers" || flow?.controlledBy === "buyers"
      ? "text-green-400"
      : flow?.controlledBy === "call-writers" || flow?.controlledBy === "sellers"
        ? "text-red-400"
        : "text-gray-300";

  return (
    <Section title={L.title} subtitle={L.subtitle} provenance="derived" collapsible>
      {insufficient ? (
        <p className="text-xs text-gray-500">{INTEL_CONFIG.insufficientData}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2">
            <span className="text-xs text-gray-400">{L.controlledBy}</span>
            <span className={`text-sm font-bold ${whoClass}`}>{who}</span>
          </div>
          <p className="text-xs text-gray-300">{flow!.explanation}</p>
          {/* Honest about the missing exchange-reported flow. */}
          <div className="flex items-center justify-between border-t border-gray-800 pt-2 text-xs">
            <span className="text-gray-400">{L.fiiDii}</span>
            <span className="text-gray-500">{INTEL_CONFIG.insufficientData.split(" — ")[0]}</span>
          </div>
        </div>
      )}
    </Section>
  );
}
