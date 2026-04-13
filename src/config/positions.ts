export const POSITIONS_CONFIG = {
  page: {
    title: "Positions",
    subtitle: "Track your open and closed positions",
  },
  refreshInterval: 5000,
  tabs: {
    open: "Open Positions",
    closed: "Closed Positions",
  },
  tableHeaders: {
    open: [
      "Instrument",
      "Qty",
      "Avg Price",
      "LTP",
      "Invested",
      "Current Value",
      "Unrealized P&L",
      "P&L %",
      "Actions",
    ],
    closed: [
      "Instrument",
      "Qty",
      "Avg Price",
      "Exit Price",
      "Invested",
      "Exit Value",
      "Realized P&L",
      "P&L %",
      "Closed At",
    ],
  },
  emptyStates: {
    open: "No open positions",
    openSub: "Place a trade to see positions here",
    closed: "No closed positions yet",
    closedSub: "Your trade history will appear here",
  },
  actions: {
    closePosition: "Close Position",
    closeAll: "Close All",
    addNotes: "Add Notes",
    refresh: "Refresh",
  },
} as const;
