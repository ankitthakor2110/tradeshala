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

  // Symbols the dashboard can analyse. Restricted to indices that have BOTH a
  // real option chain AND real intraday candles (see option-chain.ts / the
  // candles route) — so no panel is ever computed from mock prices. `liveSymbol`
  // is the live_quotes Realtime key (null when the index isn't streamed; the
  // spot then falls back to the chain underlying, still real). The first entry
  // is the default when no `?symbol=` is given.
  symbols: [
    { key: "NIFTY", label: "NIFTY", liveSymbol: "NIFTY 50", interval: "1minute" as const },
    { key: "BANKNIFTY", label: "BANK NIFTY", liveSymbol: "BANK NIFTY", interval: "1minute" as const },
    { key: "FINNIFTY", label: "FIN NIFTY", liveSymbol: null, interval: "1minute" as const },
    { key: "SENSEX", label: "SENSEX", liveSymbol: "SENSEX", interval: "1minute" as const },
  ] as { key: string; label: string; liveSymbol: string | null; interval: "1minute" | "30minute" }[],

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

  // ===========================================================================
  // AI decision-engine knobs — copy, weights, thresholds for the new cards.
  // Pure logic lives in src/lib/intel/{writers,premium,migration,readiness,
  // score,brain}.ts and reads from here so the math stays declarative.
  // ===========================================================================

  writers: {
    // Blend weights for put/call writer confidence.
    weights: { pcr: 1.0, oiSkew: 1.2, premiumDecay: 1.0 },
    // |winner margin| (confidence points) below this ⇒ "balanced".
    balancedMargin: 8,
    labels: {
      title: "Option Writer Intelligence",
      subtitle: "Who controls the chain — put writers vs call writers",
      put: "Put Writers",
      call: "Call Writers",
      winnerPut: "Put writers in control",
      winnerCall: "Call writers in control",
      balanced: "Neither side dominant",
      reasons: {
        putPremiumDecay: "Put Premium Decaying",
        freshPutWriting: "Fresh Put Writing",
        callCovering: "Call Covering",
        callPremiumDecay: "Call Premium Decaying",
        freshCallWriting: "Fresh Call Writing",
        putCovering: "Put Covering",
        pcrPut: "Put OI dominance (PCR)",
        pcrCall: "Call OI dominance (PCR)",
        balanced: "Writing is two-sided",
      } as Record<string, string>,
    },
  },

  premium: {
    // |Δ| ≥ this fraction of the base premium ⇒ "fast" rise/decay.
    fastPctOfBase: 0.12,
    // |Δ| < this fraction ⇒ "flat".
    flatPct: 0.03,
    labels: {
      title: "Premium Behaviour",
      subtitle: "ATM option premium as a primary signal — not just LTP",
      ce: "CE Premium",
      pe: "PE Premium",
      directions: {
        increasing: "Increasing",
        decreasing: "Decreasing",
        "fast-rise": "Fast Rise",
        "fast-decay": "Fast Decay",
        flat: "Flat",
      } as Record<string, string>,
    },
    interpret: {
      putComfortable: "Put sellers comfortable — bullish tone",
      callTrapped: "Call sellers trapped — bullish pressure",
      callComfortable: "Call sellers comfortable — bearish tone",
      putTrapped: "Put sellers trapped — bearish pressure",
      strongBull: "Strong bullish momentum",
      strongBear: "Strong bearish momentum",
      shortCovering: "Short covering",
      longUnwinding: "Long unwinding",
      mixed: "Two-sided premium — no clear edge",
    },
  },

  migration: {
    labels: {
      title: "Strike Migration",
      subtitle: "How writers have shifted the defended levels this session",
      prevSupport: "Previous Support",
      currSupport: "Current Support",
      supportShift: "Support Shift",
      prevResistance: "Previous Resistance",
      currResistance: "Current Resistance",
      resistanceShift: "Resistance Shift",
      shift: { higher: "Higher", lower: "Lower", none: "No change" } as Record<string, string>,
    },
    interpret: {
      supportHigher: "Support shifted higher — institutional buying",
      supportLower: "Support shifted lower — buyers retreating",
      resistanceHigher: "Resistance shifted higher — sellers retreating",
      resistanceLower: "Resistance shifted lower — institutional selling",
      strongBull: "Both levels migrating up — strong institutional buying",
      strongBear: "Both levels migrating down — strong institutional selling",
      none: "No migration — levels holding",
    },
  },

  readiness: {
    minReady: 60, // score ≥ this ⇒ "ready"
    caution: 45, // between caution & minReady ⇒ "forming"
    labels: {
      title: "Trade Readiness",
      subtitle: "Multi-condition go / no-go",
      ready: "Ready for breakout",
      caution: "Setup forming — wait for confirmation",
      avoid: "Avoid trading",
    },
    // Weight per condition (all real-data). Used to normalize 0-100.
    weights: {
      writing: 1.4,
      pcr: 1.0,
      premium: 1.3,
      oiChange: 1.2,
      volume: 0.8,
      migration: 1.0,
      priceAction: 1.1,
      supportHolding: 1.0,
      resistanceBreak: 1.0,
    },
  },

  intelligenceScore: {
    labels: {
      title: "Market Intelligence Score",
      subtitle: "One combined 0-100 read across every fed signal",
      bands: {
        extremeBull: "Extremely Bullish",
        strongBull: "Strong Bullish",
        bull: "Bullish",
        neutral: "Neutral",
        bear: "Bearish",
        strongBear: "Strong Bearish",
      } as Record<string, string>,
    },
    // score = 50 + net*50, net = Σ(contribution·weight)/Σ(weight over AVAILABLE factors).
    weights: {
      premium: 1.3,
      pcr: 1.0,
      oiChange: 1.2,
      freshWriting: 1.2,
      volume: 0.8,
      migration: 1.0,
      priceTrend: 1.3,
      iv: 0.5,
      priceAction: 1.0,
    },
    // Band thresholds on |score − 50|.
    bands: { extreme: 35, strong: 20, mild: 8 },
    unavailableNote: "Breadth & full Greeks are not fed — excluded from the score.",
  },

  confidenceEngine: {
    labels: {
      title: "Confidence Engine",
      subtitle: "Graded probabilities, not binary signals",
      writer: "Writer Confidence",
      breakout: "Breakout Probability",
      trend: "Trend Strength",
      falseBreak: "False-Breakout Risk",
      reversal: "Reversal Probability",
    },
  },

  aiBrief: {
    labels: {
      title: "AI Market Intelligence",
      subtitle: "What the market is likely doing — and why",
      bias: "Market Bias",
      confidence: "Confidence",
      recommendation: "Trade Recommendation",
      support: "Support",
      resistance: "Resistance",
      momentum: "Momentum",
      risk: "Risk Level",
      why: "Why this signal",
      wait: "Wait — no clean edge yet",
      noTrade: "No Trade — stand aside",
      momentumLabels: { weak: "Weak", moderate: "Moderate", strong: "Strong" } as Record<string, string>,
      riskLabels: { low: "Low", medium: "Medium", high: "High" } as Record<string, string>,
    },
    // Momentum strength from trend confidence (0-100).
    momentumBands: { strong: 66, moderate: 33 },
  },

  institutionalFlow: {
    labels: {
      title: "Institutional Flow",
      subtitle: "Who currently controls the tape (derived from option writing)",
      controlledBy: "Market controlled by",
      controllers: {
        "put-writers": "Put Writers",
        "call-writers": "Call Writers",
        buyers: "Buyers",
        sellers: "Sellers",
        balanced: "Two-sided",
      } as Record<string, string>,
      fiiDii: "FII / DII Flow",
    },
  },

  // Shared copy for any card whose feed is missing / still warming up.
  insufficientData: "Insufficient Data — waiting for a live feed / session warm-up.",

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
