"use client";

import { useIsMounted } from "@/hooks/useIsMounted";
import { useScreener } from "@/hooks/useScreener";
import { FINDER_CONFIG } from "@/config/finder";
import Skeleton from "@/components/ui/Skeleton";
import DataBadge from "@/components/intel/DataBadge";
import NoFeedCard from "@/components/intel/NoFeedCard";
import FilterBar from "@/components/finder/FilterBar";
import ScreenerTable from "@/components/finder/ScreenerTable";
import IndexIntel from "@/components/finder/IndexIntel";
import LargeDeals from "@/components/finder/LargeDeals";
import { useLargeDeals } from "@/hooks/useLargeDeals";
import { timeAgo } from "@/utils/format";

export default function TradeFinderPage() {
  const mounted = useIsMounted();
  const { view, loading, source, lastUpdated, config, setConfig, refresh } = useScreener();
  const largeDeals = useLargeDeals();

  if (!mounted) return null;

  const unavailable = !loading && source === "unavailable";

  return (
    <div className="mx-auto max-w-6xl space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white lg:text-2xl">{FINDER_CONFIG.page.title}</h1>
            <DataBadge provenance={source === "unavailable" ? "none" : "live"} />
          </div>
          <p className="mt-0.5 max-w-2xl text-xs text-gray-400 sm:text-sm">{FINDER_CONFIG.page.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && <span className="text-xs text-gray-500">Updated {timeAgo(lastUpdated)}</span>}
          <button
            type="button"
            onClick={refresh}
            className="cursor-pointer rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-xs font-medium text-gray-300 transition-all hover:border-violet-500/50 hover:text-white active:scale-95"
          >
            {FINDER_CONFIG.page.refreshLabel}
          </button>
        </div>
      </div>

      <IndexIntel />

      {loading ? (
        <div className="space-y-3">
          <Skeleton variant="table" />
          <Skeleton variant="card" className="h-80" />
        </div>
      ) : unavailable ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-400">
          {FINDER_CONFIG.page.emptyUnavailable}
        </div>
      ) : (
        <>
          <FilterBar config={config} setConfig={setConfig} count={view.length} />
          <ScreenerTable rows={view} config={config} setConfig={setConfig} dealSymbols={largeDeals.symbols} />
          <p className="text-xs text-gray-500">{FINDER_CONFIG.provenanceNote}</p>

          <LargeDeals
            deals={largeDeals.deals}
            asOn={largeDeals.asOn}
            source={largeDeals.source}
            loading={largeDeals.loading}
          />

          {/* Honest placeholders — TradeFinder-style panels with no feed yet. */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <NoFeedCard
              title={FINDER_CONFIG.noFeed.optionsFlow.title}
              note={FINDER_CONFIG.noFeed.optionsFlow.note}
            />
            <NoFeedCard title={FINDER_CONFIG.noFeed.breadth.title} note={FINDER_CONFIG.noFeed.breadth.note} />
          </div>

          <p className="text-xs text-gray-600">{FINDER_CONFIG.disclaimer}</p>
        </>
      )}
    </div>
  );
}
