"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatIndianCurrency, formatPercent } from "@/utils/format";
import Skeleton from "@/components/ui/Skeleton";
import ButtonLoader from "@/components/ui/ButtonLoader";
import { portfolioConfig as C } from "@/config/portfolio";
import { useIsMounted } from "@/hooks/useIsMounted";
import { usePositions, type PositionView } from "@/hooks/usePositions";
import { useSnapshotPoller } from "@/hooks/useSnapshotPoller";
import { getVirtualCash } from "@/services/portfolio.service";
import { accountValue as calcAccountValue, allocationBuckets, buildEquityCurve } from "@/lib/portfolio/summary";

type Period = (typeof C.periods)[number];

// Display slices for the allocation donut, from the pure bucket math + config copy.
function allocationSlices(open: PositionView[], cash: number) {
  const b = allocationBuckets(open, cash);
  return [
    { ...C.allocation.cash, value: b.cash },
    { ...C.allocation.equity, value: b.equity },
    { ...C.allocation.options, value: b.options },
    { ...C.allocation.futures, value: b.futures },
  ].filter((s) => s.value > 0);
}

const fmtCurveLabel = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down" | "neutral";
}) {
  const color = tone === "up" ? "text-green-400" : tone === "down" ? "text-red-400" : "text-white";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg lg:text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${color}`}>{sub}</p>}
    </div>
  );
}

export default function PortfolioPage() {
  const mounted = useIsMounted();
  useSnapshotPoller(true); // keep live_quotes fresh while this page is open
  const { open, closed, summary, loading, userId, isLive, refresh } = usePositions();
  const [cash, setCash] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>(C.defaultPeriod);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (userId) getVirtualCash(userId).then(setCash);
  }, [userId]);

  const allocation = useMemo(() => allocationSlices(open, cash ?? 0), [open, cash]);
  const curve = useMemo(
    () =>
      buildEquityCurve(closed, period, new Date()).map((p) => ({
        date: fmtCurveLabel(p.dateKey),
        cumulative: p.cumulative,
      })),
    [closed, period]
  );

  const accountValue = calcAccountValue(cash ?? 0, summary?.currentValue ?? 0);
  const ready = mounted && !loading && cash !== null;

  const handleRefresh = async () => {
    if (!userId) return;
    setRefreshing(true);
    await Promise.all([refresh(), getVirtualCash(userId).then(setCash)]);
    setRefreshing(false);
  };

  if (!mounted) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white">{C.pageTitle}</h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">{C.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-gray-400 border border-gray-800 rounded-lg px-2.5 py-1.5">
            <span className={`w-2 h-2 rounded-full ${isLive ? "bg-green-500 animate-pulse" : "bg-gray-600"}`} aria-hidden />
            {isLive ? "Live" : "Cached"}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center justify-center gap-1.5 border border-gray-700 hover:border-violet-500/50 text-gray-300 hover:text-white px-3 py-1.5 rounded-xl text-sm transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {refreshing ? <ButtonLoader /> : <span aria-hidden>↻</span>}
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {!ready ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="card" className="h-[88px]" />)
        ) : (
          <>
            <StatCard label={C.statsLabels.accountValue} value={formatIndianCurrency(accountValue)} />
            <StatCard label={C.statsLabels.virtualCash} value={formatIndianCurrency(cash ?? 0)} />
            <StatCard label={C.statsLabels.invested} value={formatIndianCurrency(summary.totalInvested)} />
            <StatCard
              label={C.statsLabels.totalPnL}
              value={formatIndianCurrency(summary.overallPnL, { sign: true })}
              sub={formatPercent(summary.overallPnLPercent, { sign: true })}
              tone={summary.overallPnL > 0 ? "up" : summary.overallPnL < 0 ? "down" : "neutral"}
            />
            <StatCard
              label={C.statsLabels.todayPnL}
              value={formatIndianCurrency(summary.todayTotalPnL, { sign: true })}
              tone={summary.todayTotalPnL > 0 ? "up" : summary.todayTotalPnL < 0 ? "down" : "neutral"}
            />
          </>
        )}
      </div>
      {ready && <p className="text-[11px] text-gray-600 -mt-2">{C.valueNote}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Allocation donut */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl md:rounded-2xl p-4 md:p-6">
          <h3 className="text-sm md:text-base font-semibold text-white mb-4">{C.sections.allocation}</h3>
          {!ready ? (
            <Skeleton variant="card" className="h-[240px]" />
          ) : allocation.length === 0 ? (
            <p className="text-sm text-gray-500 py-16 text-center">{C.emptyStates.allocation}</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="h-[220px] w-full sm:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={allocation} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                      {allocation.map((s) => (
                        <Cell key={s.label} fill={s.color} stroke="#0b0f19" />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => formatIndianCurrency(Number(v))}
                      contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full sm:w-1/2 space-y-2">
                {allocation.map((s) => {
                  const total = allocation.reduce((t, x) => t + x.value, 0);
                  const pct = total > 0 ? (s.value / total) * 100 : 0;
                  return (
                    <div key={s.label} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-gray-300">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      <span className="text-gray-400">
                        {formatIndianCurrency(s.value)} <span className="text-gray-600">({formatPercent(pct)})</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Equity curve */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl md:rounded-2xl p-4 md:p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm md:text-base font-semibold text-white">{C.sections.equityCurve}</h3>
            <div className="flex gap-1">
              {C.periods.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`text-xs px-2 py-1 rounded-lg cursor-pointer transition-all duration-200 active:scale-95 ${
                    period === p ? "bg-violet-500 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          {!ready ? (
            <Skeleton variant="card" className="h-[220px]" />
          ) : curve.length === 0 ? (
            <p className="text-sm text-gray-500 py-16 text-center">{C.emptyStates.equityCurve}</p>
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pf-eq" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₹${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}K` : v}`}
                  />
                  <Tooltip
                    formatter={(v) => formatIndianCurrency(Number(v), { sign: true })}
                    contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 12 }}
                  />
                  <ReferenceLine y={0} stroke="#4b5563" />
                  <Area type="monotone" dataKey="cumulative" stroke="#8b5cf6" strokeWidth={2} fill="url(#pf-eq)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="text-right">
        <Link href={C.detailHref} className="text-sm text-violet-400 hover:text-violet-300 cursor-pointer">
          {C.detailLinkLabel}
        </Link>
      </div>
    </div>
  );
}
