"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
} from "recharts";
import { dashboardConfig } from "@/config/dashboard";
import {
  getGreeting,
  getMarketStatus,
  getPortfolioStats,
} from "@/services/dashboard.service";
import { getCurrentUser } from "@/services/auth.service";
import { getPnLColor, getPnLBgColor } from "@/utils/colors";
import type { DashboardStats, IndexData, StockGainerLoser } from "@/types/database";

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [userName, setUserName] = useState("");
  const [marketOpen, setMarketOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats>(dashboardConfig.mockStats);

  const { mockIndices, mockGainers, mockLosers, labels, currency } =
    dashboardConfig;

  useEffect(() => {
    setMounted(true);
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

      {/* Index cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mockIndices.map((index: IndexData) => (
          <IndexCard
            key={index.name}
            index={index}
            currency={currency}
            marketOpen={marketOpen}
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

function IndexCard({
  index,
  currency,
  marketOpen,
}: {
  index: IndexData;
  currency: string;
  marketOpen: boolean;
}) {
  const sparkData = index.sparklineData.map((v) => ({ v }));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">{index.name}</h3>
          <span
            className={`w-2 h-2 rounded-full ${marketOpen ? "bg-violet-400 animate-pulse" : "bg-red-400"}`}
          />
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${getPnLBgColor(index.isPositive ? 1 : -1)}`}
        >
          {index.isPositive ? "+" : "-"}
          {index.changePercent}%
        </span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold text-white">
            {currency}
            {index.value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
          <p
            className={`text-sm mt-0.5 ${getPnLColor(index.isPositive ? 1 : -1)}`}
          >
            {index.isPositive ? "+" : ""}
            {index.change.toFixed(2)} ({index.isPositive ? "+" : "-"}
            {index.changePercent}%)
          </p>
        </div>
        <div className="w-24 h-12" suppressHydrationWarning>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <YAxis domain={["dataMin", "dataMax"]} hide />
              <Line
                type="monotone"
                dataKey="v"
                stroke={index.isPositive ? "#22c55e" : "#ef4444"}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
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
