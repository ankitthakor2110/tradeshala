export const JOURNAL_CONFIG = {
  page: {
    title: "Trade Journal",
    subtitle: "Review closed trades, tag setups, and learn from your history",
  },
  filters: {
    all: "All",
    wins: "Wins",
    losses: "Losses",
  },
  // Quick-tag suggestions offered when journaling a trade.
  suggestedTags: ["Breakout", "Reversal", "Trend", "Scalp", "News", "FOMO", "Revenge", "Plan A+"],
  emptyState: "No closed trades yet. Once you exit a position it lands here.",
  refreshIntervalMs: 60000,
} as const;
