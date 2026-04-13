export const WATCHLIST_CONFIG = {
  page: {
    title: "Watchlist",
    subtitle: "Track stocks and indices you care about",
  },
  search: {
    placeholder: "Search stocks or indices to add... e.g. NIFTY, RELIANCE",
    minChars: 2,
    debounceMs: 300,
    addLabel: "Add",
    addedLabel: "Added",
    noResults: "No results found",
    searching: "Searching...",
  },
  empty: {
    title: "Your watchlist is empty",
    subtitle:
      "Search for any stock or index above and tap Add to start tracking it here.",
  },
  list: {
    heading: "Your watchlist",
    remove: "Remove",
    confirmRemove: "Remove from watchlist?",
    cancel: "Cancel",
    confirm: "Remove",
  },
  storageKey: "tradeshala:watchlist:v1",
} as const;
