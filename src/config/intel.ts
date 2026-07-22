// Market Intelligence Dashboard config — all copy, labels, and tunable knobs.
// Client-safe (no env reads): components render from here, never hardcode copy.
// Analytics weights/thresholds live here so the sentiment/setup/checklist math
// stays declarative and easy to retune. See src/lib/intel/* for the pure logic.

export const INTEL_CONFIG = {
  page: {
    title: "Market Intelligence",
    subtitle:
      "Institutional decision support for NIFTY scalping — who's in control, where liquidity sits, and where to act.",
    symbol: "NIFTY",
    liveSymbol: "NIFTY 50", // key in the live_quotes Realtime store
    candleInterval: "1minute" as "1minute" | "30minute",
  },

  // Data-provenance badge copy. The honesty primitive — every panel shows one.
  provenance: {
    live: { label: "LIVE", hint: "Live provider feed" },
    derived: { label: "DERIVED", hint: "Computed from live data — not exchange-reported" },
    historical: { label: "HISTORICAL", hint: "From stored daily history" },
    scheduled: {
      label: "SCHEDULED",
      hint: "Upcoming from a maintained event calendar — verify against official sources",
    },
    none: { label: "NO FEED", hint: "No data source connected yet" },
  },

  // Refresh cadence options for the config panel (ms). Chain + candles re-poll.
  refresh: {
    default: 5000,
    options: [
      { label: "Fast · 3s", ms: 3000 },
      { label: "Normal · 5s", ms: 5000 },
      { label: "Relaxed · 10s", ms: 10000 },
      { label: "Slow · 30s", ms: 30000 },
    ],
  },

  chain: {
    // Strikes each side of ATM to display / analyze.
    atmRangeDefault: 8,
    atmRangeOptions: [5, 8, 10, 15],
    // Below these session deltas a leg reads as "neutral" (noise filter).
    minOiChange: 1000,
    minLtpChange: 0.05,
  },

  openingRangeMinutes: 15,
  atrPeriod: 14,

  sentiment: {
    // Relative weights of each signal in the composite score.
    weights: {
      pcr: 1.0,
      vwap: 1.2,
      trend: 1.3,
      oiSkew: 1.4,
      momentum: 0.8,
    },
    // PCR bands: > bullish → put writers confident; < bearish → call writers.
    pcrBullish: 1.15,
    pcrBearish: 0.8,
    // Bias thresholds on net = bull - bear.
    bands: { strong: 40, mild: 15 },
  },

  setups: {
    // Only surface setups at/above this confidence (also user-tunable).
    confidenceThresholdDefault: 60,
    confidenceThresholdOptions: [50, 60, 70, 80],
    // Stop distance = max(atr * mult, price * minPct). Targets are RR multiples.
    atrStopMult: 0.75,
    minStopPct: 0.0015,
    targetRR: [1.5, 2.5],
  },

  checklist: {
    // Applicable passes on one side needed to flip WAIT → READY.
    minReady: 4,
    // Rows the user asked for that have no feed / land in a later phase. Shown as
    // N/A so the full checklist is visible without faking a pass.
    unavailable: [
      { key: "liquidity-sweep", label: "Liquidity Sweep", detail: "Needs SMC engine (next phase)" },
      { key: "order-block", label: "Order Block", detail: "Needs SMC engine (next phase)" },
      { key: "mss", label: "Market Structure Shift", detail: "Needs SMC engine (next phase)" },
      { key: "future-oi", label: "Future OI confirms", detail: "No futures feed connected" },
    ],
  },

  // Event risk — scheduled macro / expiry calendar that gates entries around
  // high-impact prints (RBI, FOMC, US CPI, expiry). See src/lib/intel/events.ts.
  events: {
    // USER-MAINTAINED macro calendar. Populate with OFFICIAL, verified datetimes
    // in IST offset (e.g. "2026-08-13T18:00:00+05:30" for a 6:00pm-IST US CPI).
    // Left empty by default on purpose: an unverified/guessed date would violate
    // this dashboard's "never fabricate" rule. The weekly F&O expiry is derived
    // automatically from the live expiry feed, so it needs no entry here.
    calendar: [] as ReadonlyArray<{
      id: string;
      label: string;
      category: string;
      impact: "high" | "medium" | "low";
      at: string; // ISO-8601 with IST offset
    }>,
    // How far the curated `calendar` has been verified through (shown to the
    // user so a stale/empty calendar is honest). Set when you add dates.
    coverageThrough: null as string | null,
    windows: {
      preWindowMin: 15, // ≤ this many min BEFORE a high-impact event → stand aside
      postWindowMin: 5, // ≤ this many min AFTER (whipsaw settle) → stand aside
      cautionLeadMin: 60, // ≤ this many min before → caution (size down / wait)
      showNext: 4, // how many upcoming events to list
      horizonMin: 4320, // 3 days — ignore events beyond this
    },
    // The weekly F&O expiry, auto-added from the live expiry date. High impact
    // (pin / theta risk into the close). Time is the 15:30 IST session close.
    expiry: {
      label: "Weekly F&O Expiry",
      category: "Expiry",
      impact: "high" as "high" | "medium" | "low",
      timeIst: "15:30",
    },
    labels: {
      title: "Event Risk",
      subtitle: "Scheduled high-impact events — stand aside around the window",
      gate: { ok: "CLEAR", caution: "CAUTION", avoid: "STAND ASIDE" } as Record<string, string>,
      clear: "No high-impact event window — clear to trade the setup.",
      empty:
        "No macro calendar configured. Add verified event dates in config/intel.ts; the weekly expiry is auto-derived.",
    },
    disclaimer:
      "Event times are scheduled estimates from a maintained calendar — verify against official sources; actual release times can shift.",
  },

  labels: {
    overview: "Market Overview",
    sentiment: "Sentiment Engine",
    chain: "Option Chain Analysis",
    oi: "Open Interest Analysis",
    setups: "Live Trade Setups",
    checklist: "Trade Checklist",
    insights: "AI Insights",
    internals: "Market Internals",
    config: "Configuration",
    verdict: "Verdict",
    warmingUp: "Warming up — OI deltas appear after the next refresh",
  },

  disclaimers: {
    derived:
      "Sentiment, setups, and structure are computed signals derived from live price + OI — decision support, not financial advice.",
    oiSession:
      "OI change is measured within this browser session (providers report 0 live). It resets on reload and warms up after the first refresh.",
    noFeed:
      "This section has no data source in the current integration and shows no fabricated values.",
  },

  // Sections the spec requested that have no feed yet — rendered as honest
  // placeholders (Futures S7, VIX / breadth / sector from S8).
  noFeed: {
    futures: {
      title: "Futures Analysis",
      note: "NIFTY futures price / OI / premium — no futures feed in the current Upstox/Dhan integration.",
    },
    vix: {
      title: "India VIX",
      note: "Volatility index not exposed by the connected providers.",
    },
    breadth: {
      title: "Advance / Decline & Breadth",
      note: "Market breadth feed not connected.",
    },
    sector: {
      title: "Sector Strength",
      note: "Sector indices not available from the connected providers.",
    },
  },

  currency: "₹",
} as const;

export type IntelConfig = typeof INTEL_CONFIG;
