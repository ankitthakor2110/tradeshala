"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  formatIndianCurrency,
  formatPercent,
  formatDate,
  timeAgo,
} from "@/utils/format";
import { getPnLColor, getPnLBgColor } from "@/utils/colors";
import LiveBadge from "@/components/ui/LiveBadge";
import ButtonLoader from "@/components/ui/ButtonLoader";
import Skeleton from "@/components/ui/Skeleton";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { POSITIONS_CONFIG } from "@/config/positions";
import { useIsMounted } from "@/hooks/useIsMounted";

// --- Local types (page runs on mock data) ---
interface MockPosition {
  id: string;
  symbol: string;
  instrument_type: "EQ" | "CE" | "PE";
  option_type: "CE" | "PE" | null;
  strike_price: number | null;
  expiry_date: string | null;
  quantity: number;
  average_price: number;
  total_invested: number;
  current_price: number;
  current_value: number;
  unrealized_pnl?: number;
  realized_pnl?: number;
  pnl_percent: number;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at?: string;
  exchange: string;
}

interface Summary {
  totalOpenPositions: number;
  todayTotalPnL: number;
  openUnrealizedPnL: number;
  openUnrealizedPnLPercent: number;
  todayRealizedPnL: number;
  overallPnL: number;
  overallPnLPercent: number;
  winRate: number;
  bestPosition: MockPosition | null;
  worstPosition: MockPosition | null;
}

interface ChartPoint {
  date: string;
  daily: number;
  cumulative: number;
}

type ChartPeriod = "Today" | "1W" | "1M" | "3M";
type PnLFilter = "all" | "profit" | "loss";
type ActiveTab = "open" | "closed";

// --- Mock data ---
const MOCK_OPEN_POSITIONS: MockPosition[] = [
  {
    id: "1",
    symbol: "NIFTY",
    instrument_type: "CE",
    option_type: "CE",
    strike_price: 22450,
    expiry_date: "2024-01-25",
    quantity: 50,
    average_price: 145.5,
    total_invested: 7275,
    current_price: 152.3,
    current_value: 7615,
    unrealized_pnl: 340,
    pnl_percent: 4.67,
    status: "OPEN",
    opened_at: new Date().toISOString(),
    exchange: "NSE",
  },
  {
    id: "2",
    symbol: "RELIANCE",
    instrument_type: "EQ",
    option_type: null,
    strike_price: null,
    expiry_date: null,
    quantity: 10,
    average_price: 2450,
    total_invested: 24500,
    current_price: 2485,
    current_value: 24850,
    unrealized_pnl: 350,
    pnl_percent: 1.43,
    status: "OPEN",
    opened_at: new Date().toISOString(),
    exchange: "NSE",
  },
  {
    id: "3",
    symbol: "HDFCBANK",
    instrument_type: "EQ",
    option_type: null,
    strike_price: null,
    expiry_date: null,
    quantity: 5,
    average_price: 1580,
    total_invested: 7900,
    current_price: 1562,
    current_value: 7810,
    unrealized_pnl: -90,
    pnl_percent: -1.14,
    status: "OPEN",
    opened_at: new Date().toISOString(),
    exchange: "NSE",
  },
];

const MOCK_CLOSED_POSITIONS: MockPosition[] = [
  {
    id: "4",
    symbol: "BANKNIFTY",
    instrument_type: "PE",
    option_type: "PE",
    strike_price: 48000,
    expiry_date: "2024-01-25",
    quantity: 15,
    average_price: 220,
    total_invested: 3300,
    current_price: 198,
    current_value: 2970,
    realized_pnl: -330,
    pnl_percent: -10,
    status: "CLOSED",
    opened_at: new Date(Date.now() - 3600000).toISOString(),
    closed_at: new Date().toISOString(),
    exchange: "NSE",
  },
  {
    id: "5",
    symbol: "TCS",
    instrument_type: "EQ",
    option_type: null,
    strike_price: null,
    expiry_date: null,
    quantity: 8,
    average_price: 3850,
    total_invested: 30800,
    current_price: 3920,
    current_value: 31360,
    realized_pnl: 560,
    pnl_percent: 1.82,
    status: "CLOSED",
    opened_at: new Date(Date.now() - 7200000).toISOString(),
    closed_at: new Date().toISOString(),
    exchange: "NSE",
  },
];

const MOCK_CHART_DATA: ChartPoint[] = [
  { date: "1 Jan", daily: 500, cumulative: 500 },
  { date: "2 Jan", daily: -200, cumulative: 300 },
  { date: "3 Jan", daily: 800, cumulative: 1100 },
  { date: "4 Jan", daily: -150, cumulative: 950 },
  { date: "5 Jan", daily: 600, cumulative: 1550 },
  { date: "6 Jan", daily: 340, cumulative: 1890 },
  { date: "7 Jan", daily: -90, cumulative: 1800 },
];

const MOCK_SUMMARY: Summary = {
  totalOpenPositions: 3,
  todayTotalPnL: 600,
  openUnrealizedPnL: 600,
  openUnrealizedPnLPercent: 1.54,
  todayRealizedPnL: 230,
  overallPnL: 1800,
  overallPnLPercent: 4.5,
  winRate: 65,
  bestPosition: MOCK_OPEN_POSITIONS[1],
  worstPosition: MOCK_OPEN_POSITIONS[2],
};

// --- Helpers ---
function getInstrumentLabel(p: MockPosition): string {
  if (p.instrument_type === "CE" || p.instrument_type === "PE") {
    const expiryShort = p.expiry_date
      ? new Date(p.expiry_date).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        })
      : "";
    return `${p.symbol} ${p.strike_price ?? ""} ${p.instrument_type}${
      expiryShort ? ` · ${expiryShort}` : ""
    }`;
  }
  return p.symbol;
}

function getInstrumentBadgeClass(type: string): string {
  if (type === "CE") return "bg-green-500/10 text-green-400 border-green-500/20";
  if (type === "PE") return "bg-red-500/10 text-red-400 border-red-500/20";
  return "bg-violet-500/10 text-violet-400 border-violet-500/20";
}

interface TooltipPayload {
  value: number;
  dataKey: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const daily = payload.find((p) => p.dataKey === "daily")?.value ?? 0;
  const cumulative = payload.find((p) => p.dataKey === "cumulative")?.value ?? 0;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-gray-400 mb-2">{label}</p>
      <p className={`text-sm font-medium ${getPnLColor(daily)}`}>
        Daily: {formatIndianCurrency(daily, { sign: true })}
      </p>
      <p className={`text-sm font-medium ${getPnLColor(cumulative)}`}>
        Cumulative: {formatIndianCurrency(cumulative, { sign: true })}
      </p>
    </div>
  );
}

// --- Page ---
export default function PositionsPage() {
  const mounted = useIsMounted();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openPositions, setOpenPositions] = useState<MockPosition[]>([]);
  const [closedPositions, setClosedPositions] = useState<MockPosition[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("open");
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("1M");
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [filterPnL, setFilterPnL] = useState<PnLFilter>("all");
  const [lastUpdated, setLastUpdated] = useState<string>(
    new Date().toISOString()
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const loadTimer = setTimeout(() => {
      setOpenPositions(MOCK_OPEN_POSITIONS);
      setClosedPositions(MOCK_CLOSED_POSITIONS);
      setSummary(MOCK_SUMMARY);
      setChartData(MOCK_CHART_DATA);
      setLoading(false);
      setLastUpdated(new Date().toISOString());
    }, 1000);

    intervalRef.current = setInterval(() => {
      setOpenPositions((prev) =>
        prev.map((p) => {
          const newPrice =
            Math.round(p.current_price * (1 + (Math.random() - 0.5) * 0.002) * 100) /
            100;
          const newValue = Math.round(newPrice * p.quantity * 100) / 100;
          const unrealized = Math.round((newValue - p.total_invested) * 100) / 100;
          const pct =
            p.total_invested > 0
              ? Math.round((unrealized / p.total_invested) * 10000) / 100
              : 0;
          return {
            ...p,
            current_price: newPrice,
            current_value: newValue,
            unrealized_pnl: unrealized,
            pnl_percent: pct,
          };
        })
      );
      setLastUpdated(new Date().toISOString());
    }, POSITIONS_CONFIG.refreshInterval);

    return () => {
      clearTimeout(loadTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 600));
    setLastUpdated(new Date().toISOString());
    setRefreshing(false);
  }, []);

  const handleClosePosition = useCallback(
    async (positionId: string) => {
      setClosingId(positionId);
      await new Promise((r) => setTimeout(r, 500));

      const toClose = openPositions.find((p) => p.id === positionId);
      if (toClose) {
        const closed: MockPosition = {
          ...toClose,
          status: "CLOSED",
          closed_at: new Date().toISOString(),
          realized_pnl: toClose.unrealized_pnl ?? 0,
        };
        setOpenPositions((prev) => prev.filter((p) => p.id !== positionId));
        setClosedPositions((prev) => [closed, ...prev]);
      }

      setClosingId(null);
      setConfirmCloseId(null);
    },
    [openPositions]
  );

  const handleCloseAll = useCallback(async () => {
    setClosingAll(true);
    await new Promise((r) => setTimeout(r, 500));
    const now = new Date().toISOString();
    const newlyClosed: MockPosition[] = openPositions.map((p) => ({
      ...p,
      status: "CLOSED",
      closed_at: now,
      realized_pnl: p.unrealized_pnl ?? 0,
    }));
    setClosedPositions((prev) => [...newlyClosed, ...prev]);
    setOpenPositions([]);
    setClosingAll(false);
    setConfirmCloseId(null);
  }, [openPositions]);

  const getFilteredClosed = useCallback((): MockPosition[] => {
    if (filterPnL === "profit") {
      return closedPositions.filter((p) => (p.realized_pnl ?? 0) > 0);
    }
    if (filterPnL === "loss") {
      return closedPositions.filter((p) => (p.realized_pnl ?? 0) < 0);
    }
    return closedPositions;
  }, [closedPositions, filterPnL]);

  if (!mounted) return null;

  const bestChartDay = chartData.reduce<ChartPoint | null>(
    (best, d) => (!best || d.daily > best.daily ? d : best),
    null
  );
  const worstChartDay = chartData.reduce<ChartPoint | null>(
    (worst, d) => (!worst || d.daily < worst.daily ? d : worst),
    null
  );

  const filteredClosed = getFilteredClosed();

  // --- Render ---
  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      {/* 1. HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white">
            {POSITIONS_CONFIG.page.title}
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            {POSITIONS_CONFIG.page.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LiveBadge source="demo" lastUpdated={lastUpdated} />
          <span className="text-xs text-gray-500 hidden md:inline">
            Updated {timeAgo(lastUpdated)}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center justify-center gap-1.5 border border-gray-700 hover:border-violet-500/50 text-gray-300 hover:text-white w-9 h-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-xl text-sm transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={POSITIONS_CONFIG.actions.refresh}
          >
            {refreshing ? <ButtonLoader /> : <span className="text-base" aria-hidden>↻</span>}
            <span className="hidden sm:inline text-sm">
              {refreshing ? "Refreshing..." : POSITIONS_CONFIG.actions.refresh}
            </span>
          </button>
          {openPositions.length > 0 && (
            <button
              onClick={() => setConfirmCloseId("all")}
              disabled={closingAll}
              className="flex items-center justify-center gap-1.5 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 w-9 h-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-xl text-sm transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={POSITIONS_CONFIG.actions.closeAll}
            >
              {closingAll ? <ButtonLoader /> : <span className="text-base" aria-hidden>✕</span>}
              <span className="hidden sm:inline text-sm">
                {POSITIONS_CONFIG.actions.closeAll}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Close-all confirmation bar */}
      {confirmCloseId === "all" && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-sm text-red-400">
            Close all {openPositions.length} open positions at current market
            prices?
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setConfirmCloseId(null)}
              className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-3 py-1.5 rounded-lg`}
            >
              Cancel
            </button>
            <button
              onClick={handleCloseAll}
              disabled={closingAll}
              className={`${INTERACTION_CLASSES.dangerButton} text-xs text-white px-3 py-1.5 rounded-lg flex items-center gap-2`}
            >
              {closingAll ? <ButtonLoader /> : null}
              Confirm Close All
            </button>
          </div>
        </div>
      )}

      {/* 2. SUMMARY STATS */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {loading || !summary
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} variant="card" className="h-24" />
            ))
          : (
              <>
                <SummaryCard
                  label="Open Positions"
                  value={String(summary.totalOpenPositions)}
                  tone="neutral"
                />
                <SummaryCard
                  label="Today's P&L"
                  value={formatIndianCurrency(summary.todayTotalPnL, { sign: true })}
                  tone={summary.todayTotalPnL > 0 ? "up" : summary.todayTotalPnL < 0 ? "down" : "neutral"}
                />
                <SummaryCard
                  label="Unrealized P&L"
                  value={formatIndianCurrency(summary.openUnrealizedPnL, { sign: true })}
                  subValue={formatPercent(summary.openUnrealizedPnLPercent, { sign: true })}
                  tone={summary.openUnrealizedPnL > 0 ? "up" : summary.openUnrealizedPnL < 0 ? "down" : "neutral"}
                />
                <SummaryCard
                  label="Realized (Today)"
                  value={formatIndianCurrency(summary.todayRealizedPnL, { sign: true })}
                  tone={summary.todayRealizedPnL > 0 ? "up" : summary.todayRealizedPnL < 0 ? "down" : "neutral"}
                />
                <SummaryCard
                  label="Overall P&L"
                  value={formatIndianCurrency(summary.overallPnL, { sign: true })}
                  subValue={formatPercent(summary.overallPnLPercent, { sign: true })}
                  tone={summary.overallPnL > 0 ? "up" : summary.overallPnL < 0 ? "down" : "neutral"}
                />
                <SummaryCard
                  label="Win Rate"
                  value={`${summary.winRate}%`}
                  tone="neutral"
                />
              </>
            )}
      </div>

      {/* 3. P&L CHART */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl md:rounded-2xl p-3 md:p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-sm md:text-base font-semibold text-white">P&L Trend</h3>
          <div className="flex gap-1">
            {(["Today", "1W", "1M", "3M"] as ChartPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setChartPeriod(p)}
                className={`text-xs px-2 py-1 rounded-lg cursor-pointer transition-all duration-200 active:scale-95 ${
                  chartPeriod === p
                    ? "bg-violet-500 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <Skeleton variant="card" className="h-[200px] md:h-[280px]" />
        ) : (
          <div className="h-[200px] md:h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `₹${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}K` : v}`}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(139,92,246,0.05)" }} />
                <Bar dataKey="daily" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.daily >= 0 ? "#22c55e" : "#ef4444"}
                    />
                  ))}
                </Bar>
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {!loading && bestChartDay && worstChartDay && (
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-800">
            <div>
              <p className="text-xs text-gray-500 mb-1">Best Day</p>
              <p className={`text-sm font-semibold ${getPnLColor(bestChartDay.daily)}`}>
                {formatIndianCurrency(bestChartDay.daily, { sign: true })}
              </p>
              <p className="text-xs text-gray-500">{bestChartDay.date}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 mb-1">Worst Day</p>
              <p className={`text-sm font-semibold ${getPnLColor(worstChartDay.daily)}`}>
                {formatIndianCurrency(worstChartDay.daily, { sign: true })}
              </p>
              <p className="text-xs text-gray-500">{worstChartDay.date}</p>
            </div>
          </div>
        )}
      </div>

      {/* 4. TABS */}
      <div className="flex border-b border-gray-800 overflow-x-auto">
        <TabButton
          active={activeTab === "open"}
          onClick={() => setActiveTab("open")}
          label={`${POSITIONS_CONFIG.tabs.open} (${openPositions.length})`}
        />
        <TabButton
          active={activeTab === "closed"}
          onClick={() => setActiveTab("closed")}
          label={`${POSITIONS_CONFIG.tabs.closed} (${closedPositions.length})`}
        />
      </div>

      {/* OPEN */}
      {activeTab === "open" && (
        <div>
          {loading ? (
            <div className="space-y-2">
              <Skeleton variant="table" />
              <Skeleton variant="table" />
              <Skeleton variant="table" />
            </div>
          ) : openPositions.length === 0 ? (
            <EmptyState
              title={POSITIONS_CONFIG.emptyStates.open}
              subtitle={POSITIONS_CONFIG.emptyStates.openSub}
              ctaHref="/dashboard/trade"
              ctaLabel="Place a Trade"
            />
          ) : (
            <div className="overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0">
              <div className="bg-gray-900 md:border md:border-gray-800 rounded-xl md:rounded-2xl overflow-hidden">
                  <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 bg-gray-900/50 border-b border-gray-800">
                      {POSITIONS_CONFIG.tableHeaders.open.map((h) => (
                        <th key={h} className="px-2 md:px-4 py-2 md:py-3 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {openPositions.map((p) => {
                      const pnl = p.unrealized_pnl ?? 0;
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors duration-200"
                        >
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">
                                {getInstrumentLabel(p)}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getInstrumentBadgeClass(p.instrument_type)}`}
                              >
                                {p.instrument_type}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{p.exchange}</p>
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">{p.quantity}</td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            {formatIndianCurrency(p.average_price)}
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                              <span className="text-white font-medium">
                                {formatIndianCurrency(p.current_price)}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            {formatIndianCurrency(p.total_invested)}
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            {formatIndianCurrency(p.current_value)}
                          </td>
                          <td className={`px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium ${getPnLColor(pnl)}`}>
                            {formatIndianCurrency(pnl, { sign: true })}
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md ${getPnLBgColor(p.pnl_percent)}`}
                            >
                              {p.pnl_percent >= 0 ? "▲" : "▼"}
                              {formatPercent(p.pnl_percent, { sign: true })}
                            </span>
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                            {confirmCloseId === p.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 whitespace-nowrap">
                                  Close at {formatIndianCurrency(p.current_price)}?
                                </span>
                                <button
                                  onClick={() => setConfirmCloseId(null)}
                                  className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-2 py-1 rounded-md`}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleClosePosition(p.id)}
                                  disabled={closingId === p.id}
                                  className={`${INTERACTION_CLASSES.dangerButton} text-xs text-white px-2 py-1 rounded-md flex items-center gap-1.5`}
                                >
                                  {closingId === p.id ? <ButtonLoader /> : null}
                                  Confirm
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmCloseId(p.id)}
                                className="cursor-pointer text-xs text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white hover:border-red-500 active:scale-95 px-3 py-1 rounded-md transition-all duration-200"
                              >
                                {POSITIONS_CONFIG.actions.closePosition}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CLOSED */}
      {activeTab === "closed" && (
        <div className="space-y-4">
          <div className="flex items-center gap-1 bg-gray-800/50 rounded-lg p-1 w-fit">
            {(["all", "profit", "loss"] as PnLFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilterPnL(f)}
                className={`cursor-pointer text-xs px-3 py-1.5 rounded-md transition-all duration-200 active:scale-95 capitalize ${
                  filterPnL === f
                    ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton variant="table" />
              <Skeleton variant="table" />
            </div>
          ) : filteredClosed.length === 0 ? (
            <EmptyState
              title={POSITIONS_CONFIG.emptyStates.closed}
              subtitle={POSITIONS_CONFIG.emptyStates.closedSub}
            />
          ) : (
            <div className="overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0">
              <div className="bg-gray-900 md:border md:border-gray-800 rounded-xl md:rounded-2xl overflow-hidden">
                  <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 bg-gray-900/50 border-b border-gray-800">
                      {POSITIONS_CONFIG.tableHeaders.closed.map((h) => (
                        <th key={h} className="px-2 md:px-4 py-2 md:py-3 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClosed.map((p) => {
                      const pnl = p.realized_pnl ?? 0;
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors duration-200"
                        >
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">
                                {getInstrumentLabel(p)}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getInstrumentBadgeClass(p.instrument_type)}`}
                              >
                                {p.instrument_type}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{p.exchange}</p>
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">{p.quantity}</td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            {formatIndianCurrency(p.average_price)}
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            {formatIndianCurrency(p.current_price)}
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            {formatIndianCurrency(p.total_invested)}
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            {formatIndianCurrency(p.current_value)}
                          </td>
                          <td className={`px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium ${getPnLColor(pnl)}`}>
                            {formatIndianCurrency(pnl, { sign: true })}
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md ${getPnLBgColor(p.pnl_percent)}`}
                            >
                              {p.pnl_percent >= 0 ? "▲" : "▼"}
                              {formatPercent(p.pnl_percent, { sign: true })}
                            </span>
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-400 whitespace-nowrap">
                            <div>{formatDate(p.closed_at)}</div>
                            <div className="text-gray-500">
                              {p.closed_at ? timeAgo(p.closed_at) : ""}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. BEST & WORST */}
      {!loading && closedPositions.length > 0 && (() => {
        const best = closedPositions.reduce<MockPosition | null>(
          (b, p) => (!b || (p.realized_pnl ?? 0) > (b.realized_pnl ?? 0) ? p : b),
          null
        );
        const worst = closedPositions.reduce<MockPosition | null>(
          (w, p) => (!w || (p.realized_pnl ?? 0) < (w.realized_pnl ?? 0) ? p : w),
          null
        );
        return (
          <div className="grid grid-cols-2 gap-3">
            {/* Best position card */}
            <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3">
              <p className="text-xs text-green-400 font-medium mb-1">🏆 Best</p>
              <p className="text-sm font-bold text-white truncate">
                {best?.symbol ?? "—"}
              </p>
              <p className="text-sm font-bold text-green-400">
                {best ? formatIndianCurrency(best.realized_pnl ?? 0, { sign: true }) : "—"}
              </p>
            </div>

            {/* Worst position card */}
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
              <p className="text-xs text-red-400 font-medium mb-1">📉 Worst</p>
              <p className="text-sm font-bold text-white truncate">
                {worst?.symbol ?? "—"}
              </p>
              <p className="text-sm font-bold text-red-400">
                {worst ? formatIndianCurrency(worst.realized_pnl ?? 0, { sign: true }) : "—"}
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// --- Small presentational components ---
interface SummaryCardProps {
  label: string;
  value: string;
  subValue?: string;
  tone: "up" | "down" | "neutral";
}

function SummaryCard({ label, value, subValue, tone }: SummaryCardProps) {
  const toneClass =
    tone === "up"
      ? "text-green-400"
      : tone === "down"
        ? "text-red-400"
        : "text-white";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <p className="text-xs text-gray-400 truncate">{label}</p>
      <p className={`text-base md:text-xl font-bold mt-1 truncate ${toneClass}`}>{value}</p>
      {subValue && <p className={`text-xs mt-0.5 ${toneClass}`}>{subValue}</p>}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

function TabButton({ active, onClick, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 cursor-pointer text-xs md:text-sm font-medium whitespace-nowrap px-3 md:px-4 py-2.5 transition-colors duration-200 border-b-2 -mb-px active:opacity-70 ${
        active
          ? "text-violet-400 border-violet-500"
          : "text-gray-400 hover:text-white border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

interface EmptyStateProps {
  title: string;
  subtitle: string;
  ctaHref?: string;
  ctaLabel?: string;
}

function EmptyState({ title, subtitle, ctaHref, ctaLabel }: EmptyStateProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl py-16 px-6 flex flex-col items-center text-center">
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
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className={`${INTERACTION_CLASSES.primaryButton} inline-block text-white px-6 py-2.5 rounded-xl font-semibold text-sm mt-6`}
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

