"use client";

import { INTEL_CONFIG } from "@/config/intel";
import type { DataProvenance } from "@/types/intel";

const STYLES: Record<DataProvenance, string> = {
  live: "text-green-400 bg-green-500/10 border-green-500/20",
  derived: "text-violet-300 bg-violet-500/10 border-violet-500/20",
  historical: "text-sky-300 bg-sky-500/10 border-sky-500/20",
  scheduled: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  none: "text-gray-400 bg-gray-500/10 border-gray-500/20",
};

/**
 * Provenance pill — the honesty primitive. Every panel declares whether its
 * numbers are LIVE from a provider, DERIVED (computed), HISTORICAL, or have
 * NO FEED, so a computed signal is never mistaken for exchange truth.
 */
export default function DataBadge({ provenance }: { provenance: DataProvenance }) {
  const meta = INTEL_CONFIG.provenance[provenance];
  return (
    <span
      title={meta.hint}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${STYLES[provenance]}`}
    >
      {provenance === "live" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
        </span>
      )}
      {meta.label}
    </span>
  );
}
