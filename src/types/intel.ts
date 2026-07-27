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

// ---------------------------------------------------------------------------
// AI decision-engine layer (see src/lib/intel/{writers,premium,migration,
// readiness,score,brain}.ts). Everything here is DERIVED from live price + OI.
// When an input is missing (warming up, or no feed), the field is null / carries
// an `insufficient` flag so the UI can show "Insufficient Data" — never a guess.
// ---------------------------------------------------------------------------

export type MomentumStrength = "weak" | "moderate" | "strong";
export type RiskLevel = "low" | "medium" | "high";

/** The headline "AI Market Intelligence" read — what to do and why. */
export interface AiBrief {
  bias: Bias;
  confidence: number; // 0-100
  recommendation: string; // "Buy CE above 24050" / "Buy PE below 23980" / "Wait — no edge"
  recommendationDirection: "long" | "short" | "wait";
  support: number | null;
  resistance: number | null;
  momentum: MomentumStrength;
  risk: RiskLevel;
  reasons: string[]; // "Why this signal"
}

export type WriterWinner = "put" | "call" | "balanced";

/** Who controls the option chain — put writers vs call writers. */
export interface WriterConfidence {
  putConfidence: number | null; // 0-100
  callConfidence: number | null; // 0-100
  winner: WriterWinner | null;
  reason: string; // "Put Premium Decaying", "Fresh Put Writing", "Call Covering", …
  insufficient: boolean;
}

export type PremiumDirection = "increasing" | "decreasing" | "fast-rise" | "fast-decay" | "flat";

export interface PremiumLeg {
  direction: PremiumDirection;
  changePct: number | null; // session % move in the ATM premium
}

/** ATM premium behaviour, read as a primary signal (not just LTP display). */
export interface PremiumBehaviour {
  ce: PremiumLeg;
  pe: PremiumLeg;
  interpretation: string; // "Put sellers comfortable", "Call sellers trapped", "Short Covering", …
  tone: InsightTone;
  insufficient: boolean;
}

export type StrikeShift = "higher" | "lower" | "none";

/** How institutional writers have shifted the defended support/resistance strikes. */
export interface StrikeMigration {
  prevSupport: number | null;
  currSupport: number | null;
  supportShift: StrikeShift;
  prevResistance: number | null;
  currResistance: number | null;
  resistanceShift: StrikeShift;
  interpretation: string; // "Support shifted higher — strong institutional buying", …
  tone: InsightTone;
  insufficient: boolean;
}

export interface ReadinessFactor {
  key: string;
  label: string;
  state: ChecklistState; // "pass" | "fail" | "na"
  favors: "long" | "short" | null;
  detail: string;
}

/** Multi-condition trade-readiness gauge. */
export interface TradeReadiness {
  score: number; // 0-100
  label: string; // "Ready for breakout" / "Avoid trading" / …
  direction: "long" | "short" | "none";
  factors: ReadinessFactor[];
}

export interface ScoreFactor {
  key: string;
  label: string;
  contribution: number; // signed directional value in [-1,1] (before weighting)
  detail: string;
  available: boolean; // false → not fed (e.g. breadth / greeks); excluded from the score
}

/** One combined 0-100 read (50 = neutral, >50 bullish). */
export interface IntelligenceScore {
  score: number; // 0-100
  label: string; // "Extremely Bullish" … "Neutral" … "Strong Bearish"
  tone: InsightTone;
  factors: ScoreFactor[];
}

/** Graded confidence engine — probabilities instead of binary signals. */
export interface ConfidenceMetrics {
  writerConfidence: number | null; // 0-100
  breakoutProbability: number | null;
  trendStrength: number | null;
  falseBreakoutRisk: number | null;
  reversalProbability: number | null;
}

export interface BullBearPressure {
  bull: number; // 0-100
  bear: number; // 0-100
  pressure: "bull-dominant" | "bear-dominant" | "balanced";
}

export type FlowController = "put-writers" | "call-writers" | "buyers" | "sellers" | "balanced";

/** "Market controlled by" — derived from option writing (no FII/DII feed). */
export interface InstitutionalFlow {
  controlledBy: FlowController;
  explanation: string;
  fiiDii: null; // no feed — surfaced as "Insufficient Data"
  insufficient: boolean;
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
  // AI decision-engine layer (all nullable until data is ready).
  aiBrief: AiBrief | null;
  writers: WriterConfidence | null;
  premium: PremiumBehaviour | null;
  migration: StrikeMigration | null;
  readiness: TradeReadiness | null;
  intelligenceScore: IntelligenceScore | null;
  confidence: ConfidenceMetrics | null;
  bullBear: BullBearPressure | null;
  institutionalFlow: InstitutionalFlow | null;
}
