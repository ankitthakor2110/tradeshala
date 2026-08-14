import type { EventGate } from "@/types/intel";

// Pure event → screener treatment. A scheduled macro print (RBI / FOMC / CPI /
// expiry) is MARKET-WIDE, not per-symbol — so event risk doesn't change WHICH
// names are moving, it changes whether you should ENTER at all. This maps the
// event gate to how the Finder should present its list: clear (trade the
// setups), caution (size down), or avoid (dim the go-signals, stand aside).
//
// No DB / env / clock — fully unit-tested.

export type EventLevel = "clear" | "caution" | "avoid";

export interface EventTreatment {
  level: EventLevel;
  /** Dim the screener so ranked setups don't read as go-signals through a print. */
  dim: boolean;
  /** Tone down the "Best Trades" conviction emphasis while a window is open. */
  suppressBest: boolean;
  tone: "green" | "amber" | "red";
}

const TREATMENTS: Record<EventGate, EventTreatment> = {
  ok: { level: "clear", dim: false, suppressBest: false, tone: "green" },
  caution: { level: "caution", dim: false, suppressBest: false, tone: "amber" },
  avoid: { level: "avoid", dim: true, suppressBest: true, tone: "red" },
};

/** Resolve the presentation treatment for the current event gate. */
export function eventTreatment(gate: EventGate): EventTreatment {
  return TREATMENTS[gate];
}
