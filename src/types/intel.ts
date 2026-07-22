// Types for the Market Intelligence Dashboard (`/dashboard/intel`).
// The dashboard composes REAL provider data (spot, chain, candles) with
// TRANSPARENTLY-DERIVED signals (sentiment, setups, structure). Every panel is
// tagged with a `DataProvenance` so the UI never dresses a derived guess up as
// exchange truth — see CLAUDE.md "Market Intelligence Dashboard".

/** Where a panel's numbers come from. Drives the honesty badge on every card. */
export type DataProvenance = "live" | "derived" | "historical" | "scheduled" | "none";

/** Candle shape shared with `/api/trade/candles` (structurally identical). */
export interface Candle {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Bias =
  | "strong-bullish"
  | "bullish"
  | "neutral"
  | "bearish"
  | "strong-bearish";

export type Moneyness = "ITM" | "ATM" | "OTM";

/**
 * OI + price action interpretation for a single option leg. Side-aware: the
 * same OI-up/price-down move means "fresh call writing" on a call and "fresh
 * put writing" on a put. `neutral` = change below the noise threshold.
 */
export type OiBuildup =
  | "long-buildup"
  | "short-covering"
  | "fresh-call-writing"
  | "call-unwinding"
  | "fresh-put-writing"
  | "put-unwinding"
  | "neutral";

export interface MarketOverview {
  ltp: number;
  change: number;
  changePercent: number;
  open: number;
  prevClose: number;
  gap: number;
  gapPercent: number;
  gapType: "gap-up" | "gap-down" | "flat";
  dayHigh: number | null;
  dayLow: number | null;
  openRangeHigh: number | null;
  openRangeLow: number | null;
  vwap: number | null;
  vwapReliable: boolean;
  atr: number | null;
  dayRange: number | null;
  distanceFromVwapPct: number | null;
  trend: "bullish" | "bearish" | "neutral";
  trendConfidence: number; // 0-100
  marketOpen: boolean;
}

export interface SentimentScore {
  bull: number; // 0-100, the three sum to ~100
  bear: number;
  neutral: number;
  net: number; // bull - bear, -100..100
  overall: Bias;
  confidence: number; // 0-100
  reasons: string[]; // plain-English "why"
}

/** A single option-chain row after classification, for the S3 table. */
export interface ClassifiedRow {
  strike: number;
  moneyness: Moneyness;
  isAtm: boolean;
  ce: {
    ltp: number;
    oi: number;
    oiChange: number | null; // session delta (null until warmed up)
    volume: number;
    iv: number;
    buildup: OiBuildup;
  };
  pe: {
    ltp: number;
    oi: number;
    oiChange: number | null;
    volume: number;
    iv: number;
    buildup: OiBuildup;
  };
}

export interface OiAnalysis {
  pcr: number;
  maxCallOiStrike: number;
  maxCallOi: number;
  maxPutOiStrike: number;
  maxPutOi: number;
  maxPain: number;
  resistance: number; // ~ max call OI strike
  support: number; // ~ max put OI strike
  highestCallOiChangeStrike: number | null;
  highestPutOiChangeStrike: number | null;
  totalCeOi: number;
  totalPeOi: number;
  signals: { label: string; explanation: string; tone: InsightTone }[];
}

export interface TradeSetup {
  id: string;
  direction: "long" | "short";
  entryLabel: string; // "BUY ABOVE" / "SELL BELOW"
  trigger: number;
  stop: number;
  targets: number[]; // [T1, T2]
  rr: number; // reward:risk to T1
  confidence: number; // 0-100
  reason: string;
}

export type ChecklistState = "pass" | "fail" | "na";

export interface ChecklistItem {
  key: string;
  label: string;
  state: ChecklistState;
  favors: "long" | "short" | null;
  detail: string;
}

export interface ChecklistResult {
  items: ChecklistItem[];
  longScore: number;
  shortScore: number;
  applicable: number;
  verdict: "READY_TO_BUY" | "READY_TO_SELL" | "WAIT";
}

export type InsightTone = "bullish" | "bearish" | "neutral" | "warning";

export interface Insight {
  id: string;
  tone: InsightTone;
  text: string;
}

export interface Verdict {
  bias: Bias;
  control: "buyers" | "sellers" | "balanced";
  confidence: number; // 0-100
  headline: string;
  summary: string;
  trap: boolean;
  trapNote: string | null;
}

// ---------------------------------------------------------------------------
// Event risk (scheduled macro / expiry calendar)
// ---------------------------------------------------------------------------

export type EventImpact = "high" | "medium" | "low";

/** Trade-gate level derived from event proximity: clear → caution → stand aside. */
export type EventGate = "ok" | "caution" | "avoid";

/** A single scheduled market event (macro print, policy, expiry). */
export interface MarketEvent {
  id: string;
  label: string; // "US CPI (YoY)"
  category: string; // "US Macro", "RBI", "Expiry", …
  impact: EventImpact;
  at: string; // ISO-8601 with IST offset, e.g. "2026-07-24T15:30:00+05:30"
}

/** How close a live event window sits relative to "now". */
export type EventWindow = "upcoming" | "watch" | "pre" | "active" | "past";

export interface UpcomingEvent {
  event: MarketEvent;
  minutesUntil: number; // negative once the event time has passed
  window: EventWindow;
  gate: EventGate; // this event's own gate contribution
}

export interface EventRisk {
  gate: EventGate; // worst gate across events currently in a window
  reason: string; // plain-English "why" for the gate
  driver: UpcomingEvent | null; // the event setting the gate (soonest impactful)
  upcoming: UpcomingEvent[]; // the next few events to render (soonest first)
  hasCalendar: boolean; // false → NO FEED placeholder
  coverageThrough: string | null; // how far the maintained calendar extends
}

/** The fully-composed dashboard state produced by `useIntelData`. */
export interface IntelState {
  symbol: string;
  expiry: string | null;
  underlying: number;
  atmStrike: number;
  chainSource: "dhan" | "upstox" | "mock" | "unavailable";
  candleSource: string;
  warmingUp: boolean; // true until the 2nd chain poll (no OI deltas yet)
  lastUpdated: string | null;
  overview: MarketOverview | null;
  sentiment: SentimentScore | null;
  rows: ClassifiedRow[];
  oi: OiAnalysis | null;
  setups: TradeSetup[];
  checklist: ChecklistResult | null;
  insights: Insight[];
  verdict: Verdict | null;
  eventRisk: EventRisk | null;
}
