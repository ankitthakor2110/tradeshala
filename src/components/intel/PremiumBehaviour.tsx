"use client";

import Section from "./Section";
import { toneAccent, toneText } from "./style";
import { INTEL_CONFIG } from "@/config/intel";
import type { PremiumBehaviour as PremiumBehaviourType, PremiumLeg } from "@/types/intel";

function dirClass(dir: PremiumLeg["direction"]): string {
  if (dir === "increasing" || dir === "fast-rise") return "text-green-400";
  if (dir === "decreasing" || dir === "fast-decay") return "text-red-400";
  return "text-gray-400";
}

function Leg({ label, leg }: { label: string; leg: PremiumLeg }) {
  const D = INTEL_CONFIG.premium.labels.directions;
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${dirClass(leg.direction)}`}>{D[leg.direction]}</div>
      {leg.changePct != null && (
        <div className="text-xs text-gray-500 tabular-nums">
          {leg.changePct >= 0 ? "+" : ""}
          {leg.changePct}%
        </div>
      )}
    </div>
  );
}

export default function PremiumBehaviour({ premium }: { premium: PremiumBehaviourType | null }) {
  const L = INTEL_CONFIG.premium.labels;
  const insufficient = !premium || premium.insufficient;

  return (
    <Section title={L.title} subtitle={L.subtitle} provenance="derived" collapsible>
      {insufficient ? (
        <p className="text-xs text-gray-500">{INTEL_CONFIG.insufficientData}</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Leg label={L.ce} leg={premium!.ce} />
            <Leg label={L.pe} leg={premium!.pe} />
          </div>
          <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${toneAccent(premium!.tone)} ${toneText(premium!.tone)}`}>
            {premium!.interpretation}
          </div>
        </div>
      )}
    </Section>
  );
}
