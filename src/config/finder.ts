import type { ScreenerSortKey, ScreenerPreset } from "@/types/finder";

// Config-driven UI: all Trade Finder copy, the scan universe, column headers,
// filter presets, and refresh cadences live here — components render this, they
// never hardcode copy. Isomorphic (imported by both the client page and the
// server route), so it holds no secrets and reads no env.

interface ColumnDef {
  key: ScreenerSortKey;
  label: string;
  /** Right-align numeric columns. */
  numeric: boolean;
}

interface PresetDef {
  key: ScreenerPreset;
  label: string;
  hint: string;
}

export const FINDER_CONFIG = {
  page: {
    title: "Trade Finder",
    subtitle:
      "Live momentum screener for options-enabled (F&O) NSE stocks, ranked by real-time price action. Click any name to open its option chain and trade. Every value is a live provider quote; nothing is simulated.",
    refreshLabel: "Refresh now",
    emptyLive: "No live market data right now. It refreshes automatically, or use “Refresh now”.",
    emptyUnavailable:
      "No market-data provider is configured, so there's nothing real to show. The screener never displays mock prices.",
  },

  /**
   * The scan set — curated highly-liquid NSE large-caps that are ALL F&O
   * (options-enabled) names, so every row can deep-link straight into a live
   * option chain on the Trade page. Do not add cash-only stocks here. Symbols are
   * resolved to live quotes server-side via the provider aggregator; keep this
   * list to names the providers reliably resolve. Bounded to keep each scan a
   * light, single batch of provider calls.
   */
  universe: [
    { symbol: "RELIANCE", name: "Reliance Industries" },
    { symbol: "TCS", name: "Tata Consultancy Services" },
    { symbol: "HDFCBANK", name: "HDFC Bank" },
    { symbol: "INFY", name: "Infosys" },
    { symbol: "ICICIBANK", name: "ICICI Bank" },
    { symbol: "SBIN", name: "State Bank of India" },
    { symbol: "BHARTIARTL", name: "Bharti Airtel" },
    { symbol: "ITC", name: "ITC" },
    { symbol: "LT", name: "Larsen & Toubro" },
    { symbol: "AXISBANK", name: "Axis Bank" },
    { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank" },
    { symbol: "HINDUNILVR", name: "Hindustan Unilever" },
    { symbol: "WIPRO", name: "Wipro" },
    { symbol: "TATAMOTORS", name: "Tata Motors" },
    { symbol: "BAJFINANCE", name: "Bajaj Finance" },
    { symbol: "MARUTI", name: "Maruti Suzuki" },
    { symbol: "SUNPHARMA", name: "Sun Pharma" },
    { symbol: "TATASTEEL", name: "Tata Steel" },
    { symbol: "ADANIENT", name: "Adani Enterprises" },
    { symbol: "HCLTECH", name: "HCL Technologies" },
  ] as { symbol: string; name: string }[],

  columns: [
    { key: "symbol", label: "Symbol", numeric: false },
    { key: "ltp", label: "LTP", numeric: true },
    { key: "changePercent", label: "Change %", numeric: true },
    { key: "conviction", label: "Conviction", numeric: true },
    { key: "dayRange", label: "Day Range", numeric: true },
    { key: "volume", label: "Volume", numeric: true },
  ] as ColumnDef[],

  presets: [
    { key: "best", label: "Best Trades", hint: "Highest conviction right now" },
    { key: "all", label: "All", hint: "Every scanned symbol" },
    { key: "gainers", label: "Top Gainers", hint: "Positive movers, biggest first" },
    { key: "losers", label: "Top Losers", hint: "Negative movers, biggest first" },
    { key: "highVolume", label: "High Volume", hint: "Most actively traded" },
    { key: "watchlist", label: "My Watchlist", hint: "Only symbols on your watchlist" },
  ] as PresetDef[],

  defaults: {
    preset: "best" as ScreenerPreset,
    sortKey: "conviction" as ScreenerSortKey,
    sortDir: "desc" as const,
    minAbsChangePct: 0,
    refreshMs: 15000,
  },

  // "Conviction" is a transparent 0-100 momentum composite (magnitude × range
  // position, direction-aware) — decision support, not a guarantee.
  conviction: {
    label: "Conviction",
    bands: {
      strong: { label: "Strong", tone: "green" as const },
      moderate: { label: "Moderate", tone: "amber" as const },
      weak: { label: "Weak", tone: "gray" as const },
    },
    note: "Conviction = a transparent momentum score (size of move × where price sits in its range), not investment advice.",
  },

  // Optional Telegram threshold alerts. Fired from the server route while a tab
  // drives polling (same pattern as the snapshot refresh). Off by default;
  // requires TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID and posts to that single chat.
  alerts: {
    toggleLabel: "Telegram alerts",
    thresholdLabel: "Alert at",
    thresholdOptions: [2, 3, 5, 7],
    defaultThresholdPct: 3,
    cooldownMs: 600_000, // don't re-alert the same symbol within 10 minutes
    disabledHint: "Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to enable.",
    note: "Alerts post to the configured Telegram chat when a scanned symbol's absolute move crosses your threshold (10-minute per-symbol cooldown).",
  },

  refresh: {
    options: [
      { label: "10s", ms: 10000 },
      { label: "15s", ms: 15000 },
      { label: "30s", ms: 30000 },
      { label: "60s", ms: 60000 },
    ],
  },

  provenanceNote:
    "Prices, % change and volume are LIVE from the market-data provider. Day-range position is DERIVED from the session's OHLC.",

  // Large Deals — NSE-reported bulk/block/short transactions ("smart money").
  largeDeals: {
    title: "Large Deals",
    subtitle:
      "NSE-reported bulk, block & short-sell transactions — actual large-investor flow, straight from the exchange.",
    refreshMs: 300000, // deals change slowly; a 5-min poll is plenty
    tabs: [
      { key: "bulk", label: "Bulk Deals", hint: ">0.5% of listed shares traded by a client in a day" },
      { key: "block", label: "Block Deals", hint: "Large single trades in the exchange block window" },
      { key: "short", label: "Short Sells", hint: "Disclosed short-selling positions" },
    ] as { key: "bulk" | "block" | "short"; label: string; hint: string }[],
    columns: ["Stock", "Client / Investor", "Side", "Qty", "Avg Price", "Date"],
    sides: [
      { key: "all", label: "All" },
      { key: "BUY", label: "Buy" },
      { key: "SELL", label: "Sell" },
    ] as { key: "all" | "BUY" | "SELL"; label: string }[],
    searchPlaceholder: "Filter by stock, company or investor…",
    empty: "No deals reported for this view.",
    emptyUnavailable:
      "NSE large-deals feed is unreachable right now (it can block datacenter IPs). It'll retry automatically.",
    dealTagLabel: "DEAL",
    dealTagHint: "This stock had an NSE bulk/block deal reported recently.",
    note: "Source: NSE bulk/block/short-deal disclosures (as-on date shown). Reported large trades, not real-time tape — for research only.",
  },

  // Honest placeholders — columns TradeFinder-style products show that we can't
  // source truthfully yet. Rendered as NO-FEED cards, never as fake numbers.
  noFeed: {
    optionsFlow: {
      title: "Per-Stock Options Flow",
      note: "Candle-by-candle option OI / order-flow per stock (a la ‘Option Apex’) needs a per-equity option feed we don't have yet. Index option-flow lives on the Market Intel page.",
    },
    breadth: {
      title: "Sector & Breadth",
      note: "Advance/decline, sector rotation and market breadth need an index-constituent feed that isn't wired up yet.",
    },
  },

  disclaimer:
    "Screener for research only — not investment advice. Coverage is limited to the curated liquid-stock universe above; it is not the full market.",
} as const;
