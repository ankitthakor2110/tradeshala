"use client";

import { useEffect, useState } from "react";
import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import { formatCountdown } from "@/lib/intel/events";
import type { EventGate, EventImpact, EventRisk, UpcomingEvent } from "@/types/intel";

const CFG = INTEL_CONFIG.events;

const GATE_STYLES: Record<EventGate, { box: string; text: string; dot: string }> = {
  avoid: { box: "border-red-500/40 bg-red-500/10", text: "text-red-300", dot: "bg-red-500" },
  caution: { box: "border-amber-500/40 bg-amber-500/10", text: "text-amber-200", dot: "bg-amber-400" },
  ok: { box: "border-green-500/30 bg-green-500/5", text: "text-green-300", dot: "bg-green-500" },
};

const IMPACT_STYLES: Record<EventImpact, string> = {
  high: "text-red-300 bg-red-500/10 border-red-500/20",
  medium: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  low: "text-gray-400 bg-gray-500/10 border-gray-500/20",
};

function Countdown({ atIso, nowMs }: { atIso: string; nowMs: number }) {
  const msUntil = Date.parse(atIso) - nowMs;
  const live = msUntil <= 0;
  return (
    <span className={`tabular-nums ${live ? "text-red-300" : "text-gray-200"}`}>
      {live ? "LIVE" : formatCountdown(msUntil)}
    </span>
  );
}

function EventRow({ u, nowMs }: { u: UpcomingEvent; nowMs: number }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm text-gray-200">{u.event.label}</div>
        <div className="text-[11px] text-gray-500">{u.event.category}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${IMPACT_STYLES[u.event.impact]}`}
        >
          {u.event.impact}
        </span>
        <span className="w-16 text-right text-sm font-semibold">
          <Countdown atIso={u.event.at} nowMs={nowMs} />
        </span>
      </div>
    </li>
  );
}

/**
 * Scheduled event-risk panel. Reads the poll-cadence `eventRisk` (gate + list)
 * and runs its own 1-second clock purely to tick the countdowns — so only this
 * card re-renders each second, not the heavy chain/table above it.
 */
export default function EventRiskPanel({ eventRisk }: { eventRisk: EventRisk | null }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const hasCalendar = Boolean(eventRisk?.hasCalendar);
  const gate = eventRisk?.gate ?? "ok";
  const gs = GATE_STYLES[gate];

  return (
    <Section
      title={CFG.labels.title}
      subtitle={CFG.labels.subtitle}
      provenance={hasCalendar ? "scheduled" : "none"}
    >
      {!hasCalendar ? (
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-800/30 p-4">
          <p className="text-sm text-gray-400">{CFG.labels.empty}</p>
          <p className="mt-2 text-xs text-gray-600">{INTEL_CONFIG.disclaimers.noFeed}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Gate banner */}
          <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${gs.box}`}>
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${gs.dot}`} />
            <div className="min-w-0">
              <div className={`text-xs font-bold uppercase tracking-wide ${gs.text}`}>
                {CFG.labels.gate[gate]}
              </div>
              <div className="text-sm text-gray-300">{eventRisk?.reason}</div>
            </div>
          </div>

          {/* Upcoming events */}
          {eventRisk && eventRisk.upcoming.length > 0 ? (
            <ul className="space-y-2">
              {eventRisk.upcoming.map((u) => (
                <EventRow key={u.event.id} u={u} nowMs={nowMs} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">{CFG.labels.clear}</p>
          )}

          {eventRisk?.coverageThrough && (
            <p className="text-[11px] text-gray-600">Calendar verified through {eventRisk.coverageThrough}.</p>
          )}
          <p className="text-[11px] text-gray-600">{CFG.disclaimer}</p>
        </div>
      )}
    </Section>
  );
}
