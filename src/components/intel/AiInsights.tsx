"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import { toneText, toneAccent } from "./style";
import type { Insight } from "@/types/intel";

export default function AiInsights({ insights }: { insights: Insight[] }) {
  return (
    <Section
      title={INTEL_CONFIG.labels.insights}
      provenance="derived"
      subtitle="Plain-English read, generated from the live signals"
    >
      <div className="space-y-2">
        {insights.map((ins) => (
          <div key={ins.id} className={`rounded-lg border px-3 py-2 ${toneAccent(ins.tone)}`}>
            <p className={`text-sm ${toneText(ins.tone)}`}>{ins.text}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-gray-600">{INTEL_CONFIG.disclaimers.derived}</p>
    </Section>
  );
}
