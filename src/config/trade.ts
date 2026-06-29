export const TRADE_CONFIG = {
  page: {
    title: "Trade Simulator",
    subtitle: "Practice trading with virtual money",
  },

  instruments: {
    EQ: "Equity",
    CE: "Call Option",
    PE: "Put Option",
    FUT: "Futures",
  } as Record<string, string>,

  orderTypes: {
    MARKET: "Market",
    LIMIT: "Limit",
    SL: "Stop Loss",
    "SL-M": "Stop Loss Market",
  } as Record<string, string>,

  tradeTypes: {
    BUY: "Buy",
    SELL: "Sell",
  } as Record<string, string>,

  simulation: {
    slippagePercent: 0.05,
    brokeragePerOrder: 20,
    maxSlippage: 0.1,
    // Margin blocked when writing (selling-to-open) an option, as a fraction of
    // the contract notional (strike × shares). ~10% approximates SPAN+exposure
    // for index options (e.g. NIFTY 24000 × 65 × 0.1 ≈ ₹1.56L/lot). Paper-sim
    // estimate, not a real SPAN calc.
    shortMarginPercent: 0.1,
  },

  // Approximate Indian statutory charges, as fractions of turnover, used to make
  // simulated fills feel like a real contract note. GST applies on
  // (brokerage + txn + sebi). Values are estimates for a paper-trading sim.
  charges: {
    equity: {
      sttBuy: 0.001,
      sttSell: 0.001,
      txn: 0.0000297,
      sebi: 0.000001,
      stampBuy: 0.00015,
      gst: 0.18,
    },
    option: {
      sttBuy: 0,
      sttSell: 0.001,
      txn: 0.0003503,
      sebi: 0.000001,
      stampBuy: 0.00003,
      gst: 0.18,
    },
  },

  // Index F&O lot sizes. NSE indices reflect the revision effective Jan 2026
  // (NIFTY 75→65, BANKNIFTY 35→30, FINNIFTY 65→60, MIDCPNIFTY 140→120); SENSEX
  // is the BSE lot (20). Verify against the exchange before each contract cycle.
  defaultLotSizes: {
    NIFTY: 65,
    BANKNIFTY: 30,
    FINNIFTY: 60,
    MIDCPNIFTY: 120,
    SENSEX: 20,
  } as Record<string, number>,

  // Option chain strike window around ATM. The chain loads `initial` strikes on
  // each side and "Show more" widens it by `step`, up to `max`.
  strikeWindow: {
    initial: 5,
    step: 5,
    max: 20,
  },

  // One-tap SL / target presets, as a percentage of the entry premium.
  // SL trims the premium (buyer's downside), target grows it (buyer's upside).
  bracketPresets: {
    stopLossPercents: [20, 30, 50],
    targetPercents: [30, 50, 100],
  },

  // How many recent executed contracts to surface as quick re-entry chips.
  recentTradesLimit: 6,

  // Labels for derived chain insights (kept here so copy stays out of the page).
  moneyness: {
    itm: "ITM",
    otm: "OTM",
    atm: "ATM",
  } as Record<string, string>,

  // OI build-up classification (price move × OI move) — Indian-market convention.
  buildup: {
    longBuildup: { label: "Long buildup", tone: "green" },
    shortBuildup: { label: "Short buildup", tone: "red" },
    shortCovering: { label: "Short covering", tone: "green" },
    longUnwinding: { label: "Long unwinding", tone: "red" },
  } as Record<string, { label: string; tone: "green" | "red" }>,

  exchanges: ["NSE", "BSE", "NFO", "BFO"],

  popularStocks: [
    { symbol: "RELIANCE", name: "Reliance Industries", exchange: "NSE" },
    { symbol: "TCS", name: "Tata Consultancy Services", exchange: "NSE" },
    { symbol: "HDFCBANK", name: "HDFC Bank", exchange: "NSE" },
    { symbol: "INFY", name: "Infosys", exchange: "NSE" },
    { symbol: "ICICIBANK", name: "ICICI Bank", exchange: "NSE" },
    { symbol: "WIPRO", name: "Wipro", exchange: "NSE" },
    { symbol: "TATAMOTORS", name: "Tata Motors", exchange: "NSE" },
    { symbol: "BAJFINANCE", name: "Bajaj Finance", exchange: "NSE" },
  ],

  popularIndices: [
    { symbol: "NIFTY", name: "Nifty 50", exchange: "NSE" },
    { symbol: "BANKNIFTY", name: "Bank Nifty", exchange: "NSE" },
    { symbol: "FINNIFTY", name: "Fin Nifty", exchange: "NSE" },
    { symbol: "SENSEX", name: "Sensex", exchange: "BSE" },
  ],
} as const;
