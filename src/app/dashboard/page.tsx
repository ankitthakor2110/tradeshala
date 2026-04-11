"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { dashboardConfig } from "@/config/dashboard";
import {
  getGreeting,
  getMarketStatus,
} from "@/services/dashboard.service";
import { getCurrentUser } from "@/services/auth.service";
import { getNiftyData, getBankNiftyData } from "@/services/market-data.service";
import { getPnLColor } from "@/utils/colors";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useBrokerConnection } from "@/hooks/useBrokerConnection";
import IndexCard from "@/components/dashboard/IndexCard";
import type { DashboardStats, IndexData, StockGainerLoser } from "@/types/database";

export default function DashboardPage() {
  const mounted = useIsMounted();
  const broker = useBrokerConnection();
  const [greeting, setGreeting] = useState("");
  const [userName, setUserName] = useState("");
  const [marketOpen, setMarketOpen] = useState(false);
  const stats: DashboardStats = dashboardConfig.mockStats;
  const [indices, setIndices] = useState<IndexData[]>(dashboardConfig.mockIndices as unknown as IndexData[]);
  const [isLiveData, setIsLiveData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const { mockGainers, mockLosers, labels, currency } = dashboardConfig;

  const fetchLiveIndices = useCallback(async () => {
    const [nifty, bankNifty] = await Promise.all([
      getNiftyData(),
      getBankNiftyData(),
    ]);

    if (nifty || bankNifty) {
      const liveIndices: IndexData[] = [];

      if (nifty) {
        liveIndices.push({
          name: "NIFTY 50",
          value: nifty.last_price,
          change: nifty.change,
          changePercent: Math.abs(nifty.change_percent),
          isPositive: nifty.change >= 0,
          sparklineData: (dashboardConfig.mockIndices[0] as unknown as IndexData).sparklineData,
        });
      }

      if (bankNifty) {
        liveIndices.push({
          name: "BANK NIFTY",
          value: bankNifty.last_price,
          change: bankNifty.change,
          changePercent: Math.abs(bankNifty.change_percent),
          isPositive: bankNifty.change >= 0,
          sparklineData: (dashboardConfig.mockIndices[1] as unknown as IndexData).sparklineData,
        });
      }

      if (liveIndices.length > 0) {
        setIndices(liveIndices);
        setIsLiveData(true);
        setLastUpdated(new Date().toISOString());
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only time-dependent values
    setGreeting(getGreeting());
    setMarketOpen(getMarketStatus());

    getCurrentUser().then((user) => {
      if (user) {
        const name = (user.user_metadata?.full_name as string) ?? "Trader";
        setUserName(name.split(" ")[0]);
      } else {
        setUserName("Trader");
      }
    });
  }, []);

  // Fetch live data when broker is connected and not expired
  useEffect(() => {
    if (!broker.isConnected || broker.isExpired) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch live data on broker connect
    fetchLiveIndices();

    const interval = setInterval(fetchLiveIndices, 30000);
    return () => clearInterval(interval);
  }, [broker.isConnected, broker.isExpired, fetchLiveIndices]);

  if (!mounted) return null;

  function formatCurrency(val: number) {
    return currency + val.toLocaleString("en-IN");
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-white">
          {greeting}, {userName}!
        </h2>
        <p className="text-gray-400 mt-1">{dashboardConfig.welcomeSubtext}</p>
      </div>

      {/* Broker status banner */}
      {broker.isConnected && broker.isExpired && (
        <Link
          href="/dashboard/broker"
          className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400 hover:border-red-500/40 transition-colors duration-200 cursor-pointer"
        >
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span>
            Your <span className="font-semibold">{broker.brokerName}</span> token has expired. Click here to reconnect &rarr;
          </span>
        </Link>
      )}

      {!broker.isConnected && (
        <Link
          href="/dashboard/broker"
          className="flex items-center gap-3 p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl text-sm text-violet-400 hover:border-violet-500/40 transition-colors duration-200 cursor-pointer group"
        >
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <span>Connect a broker to get live market data &rarr;</span>
          <span className="ml-auto text-xs text-violet-400/60 group-hover:text-violet-400 transition-colors duration-200">Showing demo data</span>
        </Link>
      )}

      {/* Index cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {indices.map((index: IndexData) => (
          <IndexCard
            key={index.name}
            index={index}
            currency={currency}
            marketOpen={marketOpen}
            isLive={isLiveData && !broker.isExpired}
            lastUpdated={isLiveData ? lastUpdated : null}
          />
        ))}
      </div>

      {/* Portfolio summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          {labels.portfolioSummary}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          stocks={mockGainers as unknown as StockGainerLoser[]}
          currency={currency}
        />
        <StockList
          title={labels.topLosers}
          stocks={mockLosers as unknown as StockGainerLoser[]}
          currency={currency}
        />
      </div>
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
    <div className="bg-gray-800/50 rounded-lg p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color ?? "text-white"}`}>{value}</p>
    </div>
  );
}

function StockList({
  title,
  stocks,
  currency,
}: {
  title: string;
  stocks: StockGainerLoser[];
  currency: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-3">{title}</h3>
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
    </div>
  );
}
