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

  defaultLotSizes: {
    NIFTY: 50,
    BANKNIFTY: 15,
    FINNIFTY: 40,
    SENSEX: 10,
  } as Record<string, number>,

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
