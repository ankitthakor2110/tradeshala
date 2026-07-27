"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import type { ConfidenceMetrics } from "@/types/intel";

/** For "risk" metrics higher = worse (red); for "signal" metrics higher = better (green). */
function Metric({ label, value, invert = false }: { label: string; value: number | null; invert?: boolean }) {
  const has = value != null;
  const color = !has
    ? "bg-gray-700"
    : invert
      ? value >= 60
        ? "bg-red-500"
        : value >= 35
          ? "bg-amber-500"
          : "bg-green-500"
      : value >= 60
        ? "bg-green-500"
        : value >= 35
          ? "bg-amber-500"
          : "bg-gray-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="font-semibold tabular-nums text-gray-200">{has ? `${value}%` : "—"}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-800">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${has ? value : 0}%` }} />
      </div>
    </div>
  );
}

export default function ConfidenceEngine({ confidence }: { confidence: ConfidenceMetrics | null }) {
  const L = INTEL_CONFIG.confidenceEngine.labels;
  if (!confidence) {
    return (
      <Section title={L.title} subtitle={L.subtitle} provenance="derived" collapsible>
        <p className="text-xs text-gray-500">{INTEL_CONFIG.insufficientData}</p>
      </Section>
    );
  }

  return (
    <Section title={L.title} subtitle={L.subtitle} provenance="derived" collapsible>
      <div className="space-y-3">
        <Metric label={L.writer} value={confidence.writerConfidence} />
        <Metric label={L.breakout} value={confidence.breakoutProbability} />
        <Metric label={L.trend} value={confidence.trendStrength} />
        <Metric label={L.falseBreak} value={confidence.falseBreakoutRisk} invert />
        <Metric label={L.reversal} value={confidence.reversalProbability} invert />
      </div>
    </Section>
  );
}
