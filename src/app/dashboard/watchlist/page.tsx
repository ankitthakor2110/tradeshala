"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useIsMounted } from "@/hooks/useIsMounted";
import { searchStocks } from "@/services/market-data.service";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { WATCHLIST_CONFIG } from "@/config/watchlist";

interface WatchlistEntry {
  symbol: string;
  company_name: string;
  exchange: string;
  added_at: string;
}

interface SearchResult {
  symbol: string;
  company_name: string;
  exchange: string;
}

function loadWatchlist(): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_CONFIG.storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WatchlistEntry[]) : [];
  } catch {
    return [];
  }
}

function saveWatchlist(entries: WatchlistEntry[]): void {
  try {
    localStorage.setItem(WATCHLIST_CONFIG.storageKey, JSON.stringify(entries));
  } catch {
    // ignore quota / private-mode errors
  }
}

function makeKey(r: { symbol: string; exchange: string }): string {
  return `${r.exchange}:${r.symbol}`;
}

export default function WatchlistPage() {
  const mounted = useIsMounted();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted watchlist on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only localStorage hydration
    setWatchlist(loadWatchlist());
  }, []);

  // Persist on change
  useEffect(() => {
    if (!mounted) return;
    saveWatchlist(watchlist);
  }, [watchlist, mounted]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < WATCHLIST_CONFIG.search.minChars) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const res = await searchStocks(trimmed);
      setResults(res);
      setSearching(false);
    }, WATCHLIST_CONFIG.search.debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const isInWatchlist = useCallback(
    (r: { symbol: string; exchange: string }) =>
      watchlist.some((e) => e.symbol === r.symbol && e.exchange === r.exchange),
    [watchlist]
  );

  function handleAdd(r: SearchResult) {
    if (isInWatchlist(r)) return;
    const entry: WatchlistEntry = {
      symbol: r.symbol,
      company_name: r.company_name,
      exchange: r.exchange,
      added_at: new Date().toISOString(),
    };
    setWatchlist((prev) => [entry, ...prev]);
  }

  function handleRemove(key: string) {
    setWatchlist((prev) => prev.filter((e) => makeKey(e) !== key));
    setConfirmRemoveKey(null);
  }

  function handleClearSearch() {
    setQuery("");
    setResults([]);
  }

  if (!mounted) return null;

  const trimmed = query.trim();
  const showResults = trimmed.length >= WATCHLIST_CONFIG.search.minChars;

  return (
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-white">
          {WATCHLIST_CONFIG.page.title}
        </h1>
        <p className="text-xs sm:text-sm text-gray-400 mt-1">
          {WATCHLIST_CONFIG.page.subtitle}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={WATCHLIST_CONFIG.search.placeholder}
          className={`w-full bg-gray-900 border border-gray-800 rounded-2xl pl-12 pr-12 py-3 sm:py-4 text-sm sm:text-base text-white placeholder-gray-500 ${INTERACTION_CLASSES.formInput}`}
        />
        {query && (
          <button
            onClick={handleClearSearch}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white cursor-pointer transition-colors duration-200"
            aria-label="Clear search"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Search results */}
      {showResults && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-400">
              Results for &ldquo;{trimmed}&rdquo;
            </p>
            {!searching && (
              <p className="text-xs text-gray-500">
                {results.length} {results.length === 1 ? "match" : "matches"}
              </p>
            )}
          </div>

          {searching ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-16 bg-gray-900 border border-gray-800 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-2">
              {results.slice(0, 8).map((r) => {
                const added = isInWatchlist(r);
                return (
                  <div
                    key={makeKey(r)}
                    className="w-full flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4 gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {r.symbol}
                        </span>
                        <span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">
                          {r.exchange}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {r.company_name}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAdd(r)}
                      disabled={added}
                      className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100 ${
                        added
                          ? "bg-green-500/10 text-green-400 border border-green-500/30"
                          : "bg-violet-500 hover:bg-violet-400 text-white"
                      }`}
                      aria-label={
                        added
                          ? WATCHLIST_CONFIG.search.addedLabel
                          : `${WATCHLIST_CONFIG.search.addLabel} ${r.symbol}`
                      }
                    >
                      {added ? (
                        <span className="flex items-center gap-1">
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          {WATCHLIST_CONFIG.search.addedLabel}
                        </span>
                      ) : (
                        WATCHLIST_CONFIG.search.addLabel
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              {WATCHLIST_CONFIG.search.noResults} for &ldquo;{trimmed}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* Watchlist section */}
      {!showResults && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm md:text-base font-semibold text-white">
              {WATCHLIST_CONFIG.list.heading}
            </h2>
            {watchlist.length > 0 && (
              <span className="text-xs text-gray-500">
                {watchlist.length} {watchlist.length === 1 ? "stock" : "stocks"}
              </span>
            )}
          </div>

          {watchlist.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {watchlist.map((e) => {
                const key = makeKey(e);
                const isConfirming = confirmRemoveKey === key;
                return (
                  <div
                    key={key}
                    className="w-full flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4 gap-3 hover:border-violet-500/30 transition-colors duration-200"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">
                          {e.symbol}
                        </span>
                        <span className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">
                          {e.exchange}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {e.company_name}
                      </p>
                    </div>
                    {isConfirming ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="hidden sm:inline text-xs text-gray-400">
                          {WATCHLIST_CONFIG.list.confirmRemove}
                        </span>
                        <button
                          onClick={() => setConfirmRemoveKey(null)}
                          className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-3 py-1.5 rounded-lg`}
                        >
                          {WATCHLIST_CONFIG.list.cancel}
                        </button>
                        <button
                          onClick={() => handleRemove(key)}
                          className={`${INTERACTION_CLASSES.dangerButton} text-xs text-white px-3 py-1.5 rounded-lg`}
                        >
                          {WATCHLIST_CONFIG.list.confirm}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRemoveKey(key)}
                        className="shrink-0 text-xs text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white hover:border-red-500 cursor-pointer transition-all duration-200 active:scale-95 px-3 py-2 rounded-lg"
                        aria-label={`${WATCHLIST_CONFIG.list.remove} ${e.symbol}`}
                      >
                        {WATCHLIST_CONFIG.list.remove}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl py-12 sm:py-16 px-6 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-violet-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
          />
        </svg>
      </div>
      <p className="text-base font-semibold text-white">
        {WATCHLIST_CONFIG.empty.title}
      </p>
      <p className="text-sm text-gray-400 mt-1 max-w-sm">
        {WATCHLIST_CONFIG.empty.subtitle}
      </p>
    </div>
  );
}
