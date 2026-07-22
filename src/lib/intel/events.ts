// Event-risk engine: turns a scheduled macro/expiry calendar into a trade gate
// (clear → caution → stand aside) based on how close the next high-impact event
// is. For a scalper the biggest edge here is NOT holding through a print — an
// event in the next few minutes means whipsaw risk regardless of the setup.
//
// Pure — no DB / env / clock. "now" is passed in (ms) so it stays unit-testable
// and the caller controls the tick cadence.

import type {
  EventGate,
  EventImpact,
  EventWindow,
  MarketEvent,
  EventRisk,
  UpcomingEvent,
} from "@/types/intel";

const MIN = 60_000;

export interface EventWindows {
  preWindowMin: number;
  postWindowMin: number;
  cautionLeadMin: number;
  showNext: number;
  horizonMin: number;
}

export interface ExpiryEventConfig {
  label: string;
  category: string;
  impact: EventImpact;
  timeIst: string; // "HH:MM"
}

export interface RawEvent {
  id: string;
  label: string;
  category: string;
  impact: EventImpact;
  at: string;
}

const GATE_RANK: Record<EventGate, number> = { ok: 0, caution: 1, avoid: 2 };

/** Combine the curated macro calendar with the auto-derived weekly-expiry event. */
export function buildEventList(
  calendar: ReadonlyArray<RawEvent>,
  expiryDate: string | null,
  expiryCfg: ExpiryEventConfig
): MarketEvent[] {
  const list: MarketEvent[] = calendar.map((e) => ({
    id: e.id,
    label: e.label,
    category: e.category,
    impact: e.impact,
    at: e.at,
  }));

  // expiryDate is "YYYY-MM-DD" from the live expiry feed. Pin it to the session
  // close in IST so the window math treats it like any other scheduled event.
  if (expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
    list.push({
      id: `expiry-${expiryDate}`,
      label: expiryCfg.label,
      category: expiryCfg.category,
      impact: expiryCfg.impact,
      at: `${expiryDate}T${expiryCfg.timeIst}:00+05:30`,
    });
  }

  return list;
}

function classifyWindow(minutes: number, w: EventWindows): EventWindow {
  if (minutes > w.cautionLeadMin) return "upcoming";
  if (minutes > w.preWindowMin) return "watch";
  if (minutes >= 0) return "pre";
  if (minutes >= -w.postWindowMin) return "active";
  return "past";
}

function gateFor(impact: EventImpact, window: EventWindow): EventGate {
  if (impact === "low") return "ok";
  const imminent = window === "pre" || window === "active";
  if (impact === "high") {
    if (imminent) return "avoid";
    if (window === "watch") return "caution";
    return "ok";
  }
  // medium
  if (imminent) return "caution";
  return "ok";
}

/** "in 12m" / "in 3h 20m" / "in 2d" / "12m ago" — coarse phrasing for the reason. */
function whenPhrase(minutes: number): string {
  const past = minutes < 0;
  const m = Math.abs(minutes);
  let body: string;
  if (m < 60) body = `${m}m`;
  else if (m < 1440) {
    const h = Math.floor(m / 60);
    const rem = m % 60;
    body = rem ? `${h}h ${rem}m` : `${h}h`;
  } else {
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    body = h ? `${d}d ${h}h` : `${d}d`;
  }
  return past ? `${body} ago` : `in ${body}`;
}

/**
 * Live countdown label from a millisecond delta. mm:ss inside the hour so a
 * scalper can watch the clock into a print; coarser beyond. `msUntil <= 0` reads
 * as "now" (the event is live / just released).
 */
export function formatCountdown(msUntil: number): string {
  if (msUntil <= 0) return "now";
  const totalSec = Math.floor(msUntil / 1000);
  if (totalSec < 3600) {
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }
  if (totalSec < 86_400) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(totalSec / 86_400);
  const h = Math.floor((totalSec % 86_400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}

const IMPACT_LABEL: Record<EventImpact, string> = { high: "high-impact", medium: "medium-impact", low: "low-impact" };

const GATE_VERB: Record<EventGate, string> = {
  avoid: "stand aside",
  caution: "size down / wait",
  ok: "clear",
};

/**
 * Resolve the event calendar into a single gate for "now". The worst gate across
 * any event currently in a window wins; the driver is the soonest event carrying
 * that gate. An empty calendar reports `hasCalendar: false` so the UI shows an
 * honest NO FEED state rather than a fake "all clear".
 */
export function computeEventRisk(
  events: MarketEvent[],
  nowMs: number,
  w: EventWindows,
  coverageThrough: string | null = null,
  clearReason = "No high-impact event window.",
  emptyReason = "No event calendar configured."
): EventRisk {
  const hasCalendar = events.length > 0;

  const mapped: UpcomingEvent[] = events
    .map((event) => {
      const atMs = Date.parse(event.at);
      const minutesExact = (atMs - nowMs) / MIN;
      const window = classifyWindow(minutesExact, w);
      return {
        event,
        minutesUntil: Math.round(minutesExact),
        window,
        gate: gateFor(event.impact, window),
      };
    })
    .filter((u) => Number.isFinite(u.minutesUntil))
    .filter((u) => u.window !== "past" && u.minutesUntil <= w.horizonMin)
    .sort((a, b) => a.minutesUntil - b.minutesUntil);

  const upcoming = mapped.slice(0, w.showNext);

  // Worst gate across everything in a window; driver = soonest event at that gate.
  let gate: EventGate = "ok";
  for (const u of mapped) if (GATE_RANK[u.gate] > GATE_RANK[gate]) gate = u.gate;

  const driver = gate === "ok" ? null : mapped.find((u) => u.gate === gate) ?? null;

  let reason: string;
  if (!hasCalendar) {
    reason = emptyReason;
  } else if (!driver) {
    reason = clearReason;
  } else {
    const e = driver.event;
    reason = `${e.label} (${IMPACT_LABEL[e.impact]}) ${whenPhrase(driver.minutesUntil)} — ${GATE_VERB[gate]}.`;
  }

  return { gate, reason, driver, upcoming, hasCalendar, coverageThrough };
}
