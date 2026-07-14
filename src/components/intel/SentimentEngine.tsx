"use client";

import Section from "./Section";
import { biasClasses, biasLabel } from "./style";
import { INTEL_CONFIG } from "@/config/intel";
import type { SentimentScore } from "@/types/intel";

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
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

export default function SentimentEngine({ sentiment }: { sentiment: SentimentScore }) {
  const bc = biasClasses(sentiment.overall);
  return (
    <Section
      title={INTEL_CONFIG.labels.sentiment}
      provenance="derived"
      subtitle="Composite of PCR, VWAP, trend, OI flow & momentum"
    >
      <div className={`mb-4 flex items-center justify-between rounded-lg border px-3 py-2 ${bc.bg}`}>
        <span className="text-xs text-gray-400">Overall</span>
        <span className={`text-lg font-bold ${bc.text}`}>{biasLabel(sentiment.overall)}</span>
      </div>

      <div className="space-y-3">
        <Meter label="Bull score" value={sentiment.bull} color="bg-green-500" />
        <Meter label="Bear score" value={sentiment.bear} color="bg-red-500" />
        <Meter label="Neutral" value={sentiment.neutral} color="bg-gray-500" />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-xs font-medium text-gray-400">Why</div>
        <ul className="space-y-1">
          {sentiment.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
              <span className={bc.text}>•</span>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
