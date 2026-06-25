// Copy + tunables for the Portfolio page. Scope: a lightweight ACCOUNT SUMMARY
// (total value, cash, P&L, allocation, equity curve) — detailed holdings and
// trade history live on the Positions page. Real data comes from the live
// positions/summary + virtual_balance, never from the (unused) holdings table.

export const portfolioConfig = {
  pageTitle: "Portfolio",
  subtitle: "Your paper account at a glance",

  statsLabels: {
    accountValue: "Account Value",
    virtualCash: "Virtual Cash",
    invested: "Invested",
    totalPnL: "Total P&L",
    todayPnL: "Today's P&L",
  },

  sections: {
    allocation: "Allocation",
    equityCurve: "Realized P&L (cumulative)",
  },

  // Asset-class buckets for the allocation donut, with their slice colours.
  allocation: {
    cash: { label: "Cash", color: "#8b5cf6" },      // violet
    equity: { label: "Equity", color: "#22c55e" },  // green
    options: { label: "Options", color: "#3b82f6" }, // blue
    futures: { label: "Futures", color: "#f59e0b" }, // amber
  },

  // Equity-curve period filter (cumulative realized P&L over closed trades).
  periods: ["1W", "1M", "3M", "All"] as const,
  defaultPeriod: "1M" as const,

  emptyStates: {
    allocation: "No open positions — your capital is all in cash.",
    equityCurve: "No closed trades yet. Your realized-P&L curve will appear here.",
  },

  // Account Value = Virtual Cash + mark-to-market value of open positions.
  valueNote: "Account Value = virtual cash + current value of open positions (mark-to-market).",

  detailLinkLabel: "View all positions →",
  detailHref: "/dashboard/positions",

  currency: "₹",
} as const;
