"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";

/**
 * Honest placeholder for a section the spec requested but the current data
 * integration can't feed (Futures, VIX, breadth, sector). Shows what it WILL be,
 * clearly marked NO FEED — never fabricated numbers.
 */
export default function NoFeedCard({ title, note }: { title: string; note: string }) {
  return (
    <Section title={title} provenance="none">
      <div className="rounded-lg border border-dashed border-gray-700 bg-gray-800/30 p-4">
        <p className="text-sm text-gray-400">{note}</p>
        <p className="mt-2 text-xs text-gray-600">{INTEL_CONFIG.disclaimers.noFeed}</p>
      </div>
    </Section>
  );
}
