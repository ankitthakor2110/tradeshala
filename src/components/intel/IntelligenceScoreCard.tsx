"use client";

import Section from "./Section";
import { toneText } from "./style";
import { INTEL_CONFIG } from "@/config/intel";
import type { IntelligenceScore } from "@/types/intel";

export default function IntelligenceScoreCard({ score }: { score: IntelligenceScore | null }) {
  const L = INTEL_CONFIG.intelligenceScore.labels;
  if (!score) {
    return (
      <Section title={L.title} subtitle={L.subtitle} provenance="derived" collapsible>
        <p className="text-xs text-gray-500">{INTEL_CONFIG.insufficientData}</p>
      </Section>
    );
  }

  return (
    <Section title={L.title} subtitle={L.subtitle} provenance="derived" collapsible>
      {/* Headline score on a 0-100 track (50 = neutral). */}
      <div className="mb-3 flex items-end justify-between">
        <span className={`text-3xl font-bold tabular-nums ${toneText(score.tone)}`}>{score.score}</span>
        <span className={`text-sm font-semibold ${toneText(score.tone)}`}>{score.label}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-gradient-to-r from-red-500/40 via-gray-600/40 to-green-500/40">
        <div className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-white" style={{ left: `${score.score}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-500">
        <span>Bearish</span>
        <span>Neutral</span>
        <span>Bullish</span>
      </div>

      {/* Factor breakdown */}
      <ul className="mt-4 space-y-1">
        {score.factors.map((f) => (
          <li key={f.key} className="flex items-center justify-between gap-2 text-xs" title={f.detail}>
            <span className={f.available ? "text-gray-300" : "text-gray-600"}>{f.label}</span>
            {f.available ? (
              <span
                className={`tabular-nums font-medium ${f.contribution > 0.05 ? "text-green-400" : f.contribution < -0.05 ? "text-red-400" : "text-gray-500"}`}
              >
                {f.contribution > 0 ? "+" : ""}
                {f.contribution.toFixed(2)}
              </span>
            ) : (
              <span className="text-gray-600">not fed</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-gray-500">{INTEL_CONFIG.intelligenceScore.unavailableNote}</p>
    </Section>
  );
}
