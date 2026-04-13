"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { dashboardConfig } from "@/config/dashboard";
import { showToast } from "@/components/ui/Toast";
import {
  getGreeting,
  getMarketStatus,
} from "@/services/dashboard.service";
import { getCurrentUser } from "@/services/auth.service";
import { getIndicesData, getGainersLosers } from "@/services/market-data.service";
import { getPnLColor } from "@/utils/colors";
import { timeAgo } from "@/utils/format";
import { useIsMounted } from "@/hooks/useIsMounted";
import IndexCard, { IndexCardSkeleton } from "@/components/dashboard/IndexCard";
import LiveBadge from "@/components/ui/LiveBadge";
import type { DashboardStats, IndexData, StockGainerLoser } from "@/types/database";

type MarketPhase = "open" | "preopen" | "closed";

function getMarketPhase(): MarketPhase {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const day = now.getDay();
  if (day === 0 || day === 6) return "closed";

  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= 540 && mins < 555) return "preopen";
  if (mins >= 555 && mins <= 930) return "open";
  return "closed";
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const mounted = useIsMounted();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [greeting, setGreeting] = useState("");
  const [userName, setUserName] = useState("");
  const [marketPhase, setMarketPhase] = useState<MarketPhase>("closed");
  const [marketOpen, setMarketOpen] = useState(false);
  const stats: DashboardStats = dashboardConfig.mockStats;

  const [indices, setIndices] = useState<IndexData[]>([]);
  const [isLiveData, setIsLiveData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string | null>(null);
  const [gainers, setGainers] = useState<StockGainerLoser[]>([]);
  const [losers, setLosers] = useState<StockGainerLoser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMovers, setLoadingMovers] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [moversLastUpdated, setMoversLastUpdated] = useState<string | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { labels, currency } = dashboardConfig;

  const fetchLiveData = useCallback(async () => {
    const [indicesRes, moversRes] = await Promise.all([
      getIndicesData(),
      getGainersLosers(),
    ]);

    let gotIndices = false;
    if (indicesRes && (indicesRes.nifty50 || indicesRes.bankNifty)) {
      const liveIndices: IndexData[] = [];
      const mockIndices = dashboardConfig.mockIndices as unknown as IndexData[];

      if (indicesRes.nifty50) {
        const n = indicesRes.nifty50;
        liveIndices.push({
          name: "NIFTY 50",
          value: n.last_price,
          change: n.change,
          changePercent: Math.abs(n.change_percent),
          isPositive: n.change >= 0,
          sparklineData: mockIndices[0]?.sparklineData ?? [],
        });
      }

      if (indicesRes.bankNifty) {
        const b = indicesRes.bankNifty;
        liveIndices.push({
          name: "BANK NIFTY",
          value: b.last_price,
          change: b.change,
          changePercent: Math.abs(b.change_percent),
          isPositive: b.change >= 0,
          sparklineData: mockIndices[1]?.sparklineData ?? [],
        });
      }

      if (liveIndices.length > 0) {
        setIndices(liveIndices);
        setIsLiveData(true);
        setLastUpdated(indicesRes.last_updated);
        setDataSource(indicesRes.source ?? null);
        gotIndices = true;
      }
    }

    let gotMovers = false;
    if (moversRes && (moversRes.gainers.length > 0 || moversRes.losers.length > 0)) {
      if (moversRes.gainers.length > 0) setGainers(moversRes.gainers);
      if (moversRes.losers.length > 0) setLosers(moversRes.losers);
      setMoversLastUpdated(new Date().toISOString());
      gotMovers = true;
    }

    if (!gotIndices && indices.length === 0) {
      setIndices(dashboardConfig.mockIndices as unknown as IndexData[]);
      setIsLiveData(false);
    }
    if (!gotMovers && gainers.length === 0) {
      setGainers(dashboardConfig.mockGainers as unknown as StockGainerLoser[]);
      setLosers(dashboardConfig.mockLosers as unknown as StockGainerLoser[]);
    }

    const failed = !gotIndices && !gotMovers;
    setFetchError(failed);
    setLoading(false);
    setLoadingMovers(false);

    if (failed) {
      retryRef.current = setTimeout(fetchLiveData, 60000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle unauthorized redirect
  useEffect(() => {
    if (searchParams.get("error") === "unauthorized") {
      showToast("You don't have permission to access that page", "error");
      router.replace("/dashboard");
    }
  }, [searchParams, router]);

  useEffect(() => {
    setGreeting(getGreeting());
    setMarketOpen(getMarketStatus());
    setMarketPhase(getMarketPhase());

    getCurrentUser().then((user) => {
      if (user) {
        const name = (user.user_metadata?.full_name as string) ?? "Trader";
        setUserName(name.split(" ")[0]);
      } else {
        setUserName("Trader");
      }
    });

    const phaseInterval = setInterval(() => {
      setMarketOpen(getMarketStatus());
      setMarketPhase(getMarketPhase());
    }, 60000);

    return () => clearInterval(phaseInterval);
  }, []);

  useEffect(() => {
    fetchLiveData();

    const interval = setInterval(() => {
      if (getMarketStatus()) fetchLiveData();
    }, 30000);

    return () => {
      clearInterval(interval);
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [fetchLiveData]);

  if (!mounted) return null;

  function formatCurrency(val: number) {
    return currency + val.toLocaleString("en-IN");
  }

  const liveBadgeSource = isLiveData
    ? ((dataSource as "dhan" | "upstox") ?? "cache")
    : "demo";

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-xl lg:text-2xl font-bold text-white">
          {greeting}, {userName}!
        </h2>
        <p className="text-xs sm:text-sm text-gray-400 mt-1">{dashboardConfig.welcomeSubtext}</p>
      </div>

      {/* Market + data status banner */}
      <DataStatusBanner
        phase={marketPhase}
        fetchError={fetchError}
        isLive={isLiveData}
        source={liveBadgeSource}
        lastUpdated={lastUpdated}
      />

      {/* Index cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <>
            <IndexCardSkeleton />
            <IndexCardSkeleton />
          </>
        ) : (
          indices.map((index: IndexData) => (
            <IndexCard
              key={index.name}
              index={index}
              currency={currency}
              marketOpen={marketOpen}
              isLive={isLiveData}
              lastUpdated={lastUpdated}
              source={dataSource}
            />
          ))
        )}
      </div>

      {/* Portfolio summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl md:rounded-2xl p-4 md:p-6">
        <h3 className="text-base md:text-lg font-semibold text-white mb-4">
          {labels.portfolioSummary}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatCard label={labels.virtualCash} value={formatCurrency(stats.virtualCash)} />
          <StatCard label={labels.portfolioValue} value={formatCurrency(stats.portfolioValue)} />
          <StatCard
            label={labels.totalPnL}
            value={formatCurrency(stats.totalPnL)}
            color={getPnLColor(stats.totalPnL)}
          />
          <StatCard
            label={labels.totalPnLPercent}
            value={`${stats.totalPnLPercent >= 0 ? "+" : ""}${stats.totalPnLPercent.toFixed(2)}%`}
            color={getPnLColor(stats.totalPnLPercent)}
          />
        </div>
      </div>

      {/* Gainers & Losers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StockList
          title={labels.topGainers}
          stocks={gainers}
          currency={currency}
          loading={loadingMovers}
          lastUpdated={moversLastUpdated}
          source={liveBadgeSource}
        />
        <StockList
          title={labels.topLosers}
          stocks={losers}
          currency={currency}
          loading={loadingMovers}
          lastUpdated={moversLastUpdated}
          source={liveBadgeSource}
        />
      </div>
    </div>
  );
}

// --- Sub-components ---

function DataStatusBanner({
  phase,
  fetchError,
  isLive,
  source,
  lastUpdated,
}: {
  phase: MarketPhase;
  fetchError: boolean;
  isLive: boolean;
  source: "dhan" | "upstox" | "cache" | "demo";
  lastUpdated: string | null;
}) {
  if (fetchError) {
    return (
      <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-2.5 text-sm">
        <span className="h-2 w-2 rounded-full bg-orange-500" />
        <span className="text-orange-400">Showing cached market data</span>
        <span className="text-gray-500 text-xs ml-auto">Retrying in 60s</span>
      </div>
    );
  }

  if (isLive && (source === "dhan" || source === "upstox")) {
    return (
      <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5 text-sm">
        <LiveBadge source={source} lastUpdated={lastUpdated} />
        <span className="text-green-400">Live market data active</span>
        <span className="text-gray-500 text-xs ml-auto">Auto-refreshes every 30s</span>
      </div>
    );
  }

  if (phase === "preopen") {
    return (
      <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2.5 text-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse" />
        <span className="text-yellow-400">Pre-open Session</span>
        <span className="text-gray-500 text-xs ml-auto">Market opens at 9:15 AM IST</span>
      </div>
    );
  }

  if (phase === "open") {
    return (
      <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm">
        <span className="h-2.5 w-2.5 rounded-full bg-gray-500" />
        <span className="text-gray-400">Market Open &middot; Demo data</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-2.5 text-sm">
      <span className="h-2.5 w-2.5 rounded-full bg-gray-500" />
      <span className="text-gray-400">Market Closed &middot; Showing last closing prices</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 md:p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-base md:text-lg font-bold ${color ?? "text-white"} truncate`}>{value}</p>
    </div>
  );
}

function StockList({
  title,
  stocks,
  currency,
  loading,
  lastUpdated,
  source,
}: {
  title: string;
  stocks: StockGainerLoser[];
  currency: string;
  loading: boolean;
  lastUpdated: string | null;
  source: "dhan" | "upstox" | "cache" | "demo";
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl md:rounded-2xl p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {!loading && <LiveBadge source={source} lastUpdated={lastUpdated} />}
      </div>
      {loading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div className="h-4 w-24 bg-gray-800 rounded" />
              <div className="h-4 w-20 bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {stocks.map((stock) => (
              <div
                key={stock.symbol}
                className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
              >
                <span className="text-sm text-gray-300 font-medium">
                  {stock.symbol}
                </span>
                <div className="text-right">
                  <span
                    className={`text-sm font-medium ${getPnLColor(stock.isPositive ? 1 : -1)}`}
                  >
                    {stock.isPositive ? "+" : ""}
                    {stock.changePercent.toFixed(1)}%
                  </span>
                  <span className={`text-xs ml-2 ${stock.isPositive ? "text-green-500" : "text-red-500"}`}>
                    {stock.isPositive ? "+" : ""}
                    {currency}
                    {Math.abs(stock.change).toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {lastUpdated && (
            <p className="text-[10px] text-gray-600 mt-3 text-right">
              Last updated: {timeAgo(lastUpdated)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
