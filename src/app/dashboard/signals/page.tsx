"use client";

import { useMemo, useState, useCallback } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatIndianCurrency, formatPercent, formatDateTime, timeAgo } from "@/utils/format";
import { getPnLColor } from "@/utils/colors";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { TV_DASHBOARD_COPY } from "@/config/tradingview";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useTvLedger } from "@/hooks/useTvLedger";
import { useEngineTrades } from "@/hooks/useEngineTrades";
import { resetTvLedger } from "@/services/tradingview.service";
import { computeAllStats, equityCurve, COMBINED_KEY } from "@/lib/tv/stats";
import { showToast } from "@/components/ui/Toast";
import Skeleton from "@/components/ui/Skeleton";
import ButtonLoader from "@/components/ui/ButtonLoader";
import type { TvPosition, TvTrade, EngineOpenPosition, EngineTrade } from "@/types/tradingview";

const C = TV_DASHBOARD_COPY;
const L = TV_DASHBOARD_COPY.labels;

function fmtPF(pf: number): string {
  if (pf === Infinity) return "∞";
  return pf.toFixed(2);
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SideBadge({ side }: { side: "long" | "short" }) {
  const cls =
    side === "long"
      ? "bg-green-500/10 text-green-400 border-green-500/20"
      : "bg-red-500/10 text-red-400 border-red-500/20";
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-md border uppercase font-medium ${cls}`}>
      {side}
    </span>
  );
}

function ReasonBadge({ reason }: { reason: TvTrade["reason"] }) {
  const map: Record<TvTrade["reason"], string> = {
    tp: "bg-green-500/10 text-green-400",
    sl: "bg-red-500/10 text-red-400",
    reverse: "bg-amber-500/10 text-amber-400",
    manual: "bg-gray-700/40 text-gray-300",
  };
  return <span className={`text-[11px] px-2 py-0.5 rounded-md ${map[reason]}`}>{reason}</span>;
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "neutral";
}) {
  const color =
    tone === "up" ? "text-green-400" : tone === "down" ? "text-red-400" : "text-white";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <p className={`text-base sm:text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

type ClosedSortKey = "closed_at" | "strategy" | "side" | "entry_price" | "exit_price" | "net" | "reason";

function closedSortValue(t: TvTrade, key: ClosedSortKey): number | string {
  switch (key) {
    case "closed_at": return Date.parse(t.closed_at);
    case "strategy": return t.strategy;
    case "side": return t.side;
    case "entry_price": return t.entry_price;
    case "exit_price": return t.exit_price;
    case "net": return t.net;
    case "reason": return t.reason;
  }
}

export default function SignalsPage() {
  const mounted = useIsMounted();
  const { open, closed, loading, lastUpdated, refresh } = useTvLedger();
  const { open: engineOpen, closed: engineClosed, loading: engineLoading } = useEngineTrades();
  const [selected, setSelected] = useState<string>(COMBINED_KEY);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sortKey, setSortKey] = useState<ClosedSortKey>("closed_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const allStats = useMemo(() => computeAllStats(closed), [closed]);
  const stats = useMemo(
    () => allStats.find((s) => s.strategy === selected) ?? allStats[0],
    [allStats, selected]
  );
  const curve = useMemo(() => {
    const pts = equityCurve(closed, selected);
    return pts.map((p) => ({ label: fmtTime(p.closed_at), cumulative: p.cumulative, net: p.net }));
  }, [closed, selected]);

  const filteredClosed = useMemo(() => {
    const list =
      selected === COMBINED_KEY ? closed : closed.filter((t) => t.strategy === selected);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = closedSortValue(a, sortKey);
      const bv = closedSortValue(b, sortKey);
      if (typeof av === "string") return dir * av.localeCompare(bv as string);
      return dir * ((av as number) - (bv as number));
    });
  }, [closed, selected, sortKey, sortDir]);

  const openForSelected = useMemo(
    () => (selected === COMBINED_KEY ? open : open.filter((p) => p.strategy === selected)),
    [open, selected]
  );

  const toggleSort = useCallback((key: ClosedSortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir(key === "strategy" || key === "side" || key === "reason" ? "asc" : "desc");
      return key;
    });
  }, []);

  const handleReset = useCallback(async () => {
    setResetting(true);
    const res = await resetTvLedger();
    showToast(res.message, res.ok ? "success" : "error");
    if (res.ok) await refresh();
    setResetting(false);
    setConfirmReset(false);
  }, [refresh]);

  if (!mounted) return null;

  const strategyKeys = allStats.map((s) => s.strategy);

  const sortArrow = (key: ClosedSortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white">{C.title}</h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">{C.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-gray-400 border border-gray-800 rounded-lg px-2.5 py-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" aria-hidden />
            Live · polling
          </span>
          {lastUpdated && (
            <span className="text-xs text-gray-500 hidden md:inline">Updated {timeAgo(lastUpdated)}</span>
          )}
          <button
            onClick={() => setConfirmReset(true)}
            disabled={resetting}
            className="flex items-center gap-1.5 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 px-3 py-1.5 rounded-xl text-xs transition-all duration-200 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {C.resetLabel}
          </button>
        </div>
      </div>

      {/* DISCLAIMER — directional proxy, not real option P&L */}
      <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300/90">
        <span aria-hidden>⚠</span>
        <p>{C.disclaimer}</p>
      </div>

      {/* AUTOMATED ENGINE TRADES — the real option paper-trades + their exits */}
      <EngineTradesSection open={engineOpen} closed={engineClosed} loading={engineLoading} />

      {/* RESET CONFIRM */}
      {confirmReset && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-sm text-red-400">{C.resetConfirm}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setConfirmReset(false)}
              className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-300 px-3 py-1.5 rounded-lg`}
            >
              Cancel
            </button>
            <button
              onClick={handleReset}
              disabled={resetting}
              className={`${INTERACTION_CLASSES.dangerButton} text-xs text-white px-3 py-1.5 rounded-lg flex items-center gap-2`}
            >
              {resetting ? <ButtonLoader /> : null}
              Confirm reset
            </button>
          </div>
        </div>
      )}

      {/* --- SIGNAL LEDGER (directional proxy) --- */}
      <div className="pt-2 border-t border-gray-800/60">
        <h2 className="text-sm md:text-base font-semibold text-white">Signal Ledger</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Directional proxy (points × lot − costs) from every TradingView signal — not real option P&amp;L. Stats and equity below are for this ledger.
        </p>
      </div>

      {/* STRATEGY SELECTOR */}
      <div className="flex gap-1.5 flex-wrap">
        {strategyKeys.map((key) => (
          <button
            key={key}
            onClick={() => setSelected(key)}
            className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-all duration-200 active:scale-95 ${
              selected === key
                ? "bg-violet-500 text-white"
                : "bg-gray-900 border border-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            {key === COMBINED_KEY ? C.combinedLabel : key}
          </button>
        ))}
      </div>

      {/* STATS PANEL */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} variant="card" className="h-[68px]" />)
        ) : (
          <>
            <StatCard label={L.trades} value={String(stats.trades)} />
            <StatCard label={L.winRate} value={formatPercent(stats.winRate)} />
            <StatCard label={L.profitFactor} value={fmtPF(stats.profitFactor)} />
            <StatCard
              label={L.expectancy}
              value={formatIndianCurrency(stats.expectancy, { sign: true })}
              tone={stats.expectancy > 0 ? "up" : stats.expectancy < 0 ? "down" : "neutral"}
            />
            <StatCard
              label={L.netPnl}
              value={formatIndianCurrency(stats.netPnl, { sign: true })}
              tone={stats.netPnl > 0 ? "up" : stats.netPnl < 0 ? "down" : "neutral"}
            />
            <StatCard
              label={L.avgWin}
              value={formatIndianCurrency(stats.avgWin, { sign: true })}
              tone={stats.avgWin > 0 ? "up" : "neutral"}
            />
            <StatCard
              label={L.avgLoss}
              value={formatIndianCurrency(stats.avgLoss, { sign: true })}
              tone={stats.avgLoss < 0 ? "down" : "neutral"}
            />
            <StatCard
              label={L.maxDrawdown}
              value={formatIndianCurrency(stats.maxDrawdown, { sign: true })}
              tone={stats.maxDrawdown < 0 ? "down" : "neutral"}
            />
          </>
        )}
      </div>

      {/* EQUITY CURVE */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl md:rounded-2xl p-3 md:p-6 overflow-hidden">
        <h3 className="text-sm md:text-base font-semibold text-white mb-4">{L.equityCurve}</h3>
        {loading ? (
          <Skeleton variant="card" className="h-[200px] md:h-[260px]" />
        ) : curve.length === 0 ? (
          <p className="text-sm text-gray-500 py-12 text-center">{C.emptyClosed}</p>
        ) : (
          <div className="h-[200px] md:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={curve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} minTickGap={24} />
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
                <Line type="monotone" dataKey="cumulative" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* OPEN POSITIONS */}
      <Section title="Open Positions" count={openForSelected.length}>
        {loading ? (
          <Skeleton variant="card" className="h-24" />
        ) : openForSelected.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">{C.emptyOpen}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                  <Th>{L.strategy}</Th>
                  <Th>{L.symbol}</Th>
                  <Th>{L.side}</Th>
                  <Th className="text-right">{L.entry}</Th>
                  <Th className="text-right">{L.sl}</Th>
                  <Th className="text-right">{L.tp}</Th>
                  <Th className="text-right">{L.qty}</Th>
                  <Th>{L.openedAt}</Th>
                </tr>
              </thead>
              <tbody>
                {openForSelected.map((p: TvPosition) => (
                  <tr key={p.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                    <Td className="text-gray-300">{p.strategy}</Td>
                    <Td className="text-white font-medium">
                      {p.symbol}
                      {p.option_type ? <span className="text-gray-500 text-xs"> · {p.option_type}</span> : null}
                    </Td>
                    <Td><SideBadge side={p.side} /></Td>
                    <Td className="text-right text-gray-200">{formatIndianCurrency(p.entry_price)}</Td>
                    <Td className="text-right text-gray-400">{p.sl != null ? formatIndianCurrency(p.sl) : "—"}</Td>
                    <Td className="text-right text-gray-400">{p.tp != null ? formatIndianCurrency(p.tp) : "—"}</Td>
                    <Td className="text-right text-gray-200">{p.qty}</Td>
                    <Td className="text-gray-500 text-xs">{timeAgo(p.opened_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-600 mt-2">{C.openNote}</p>
          </div>
        )}
      </Section>

      {/* CLOSED TRADES */}
      <Section title="Closed Trades" count={filteredClosed.length}>
        {loading ? (
          <Skeleton variant="card" className="h-24" />
        ) : filteredClosed.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">{C.emptyClosed}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                  <Th sortable onClick={() => toggleSort("closed_at")}>{L.closedAt}{sortArrow("closed_at")}</Th>
                  <Th sortable onClick={() => toggleSort("strategy")}>{L.strategy}{sortArrow("strategy")}</Th>
                  <Th sortable onClick={() => toggleSort("side")}>{L.side}{sortArrow("side")}</Th>
                  <Th sortable onClick={() => toggleSort("entry_price")} className="text-right">{L.entry}{sortArrow("entry_price")}</Th>
                  <Th sortable onClick={() => toggleSort("exit_price")} className="text-right">{L.exit}{sortArrow("exit_price")}</Th>
                  <Th className="text-right">{L.qty}</Th>
                  <Th sortable onClick={() => toggleSort("net")} className="text-right">{L.net}{sortArrow("net")}</Th>
                  <Th sortable onClick={() => toggleSort("reason")}>{L.reason}{sortArrow("reason")}</Th>
                </tr>
              </thead>
              <tbody>
                {filteredClosed.map((t: TvTrade) => (
                  <tr key={t.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                    <Td className="text-gray-400 text-xs">{fmtTime(t.closed_at)}</Td>
                    <Td className="text-gray-300">{t.strategy}</Td>
                    <Td><SideBadge side={t.side} /></Td>
                    <Td className="text-right text-gray-200">{formatIndianCurrency(t.entry_price)}</Td>
                    <Td className="text-right text-gray-200">{formatIndianCurrency(t.exit_price)}</Td>
                    <Td className="text-right text-gray-200">{t.qty}</Td>
                    <Td className={`text-right font-medium ${getPnLColor(t.net)}`}>
                      {formatIndianCurrency(t.net, { sign: true })}
                    </Td>
                    <Td><ReasonBadge reason={t.reason} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ===========================================================================
// Automated engine trades — the REAL option paper-trades + their exits.
// ===========================================================================
const E = TV_DASHBOARD_COPY.engine;

function heldTime(open: string | null, close: string | null): string {
  if (!open || !close) return "—";
  const ms = new Date(close).getTime() - new Date(open).getTime();
  if (ms < 0) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function engineContract(t: { symbol: string; strike: number | null; optionType: "CE" | "PE"; expiry: string | null }): string {
  const exp = t.expiry
    ? new Date(t.expiry).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "";
  return `${t.symbol} ${t.strike ?? ""} ${t.optionType}${exp ? ` · ${exp}` : ""}`;
}

const lotsLabel = (qty: number, lotSize: number): string => {
  if (lotSize > 1) {
    const lots = qty / lotSize;
    return `${qty} qty · ${lots} lot${lots !== 1 ? "s" : ""}`;
  }
  return `${qty} qty`;
};

function EngineReasonBadge({ reason }: { reason: EngineTrade["exitReason"] }) {
  const cls: Record<EngineTrade["exitReason"], string> = {
    target: "bg-green-500/10 text-green-400 border-green-500/20",
    stop: "bg-red-500/10 text-red-400 border-red-500/20",
    trail: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    squareoff: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    scaleout: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    signal: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    manual: "bg-gray-700/40 text-gray-300 border-gray-600/30",
  };
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-md border ${cls[reason]}`}>
      {E.reasons[reason] ?? reason}
    </span>
  );
}

function EngineOpenCard({ p }: { p: EngineOpenPosition }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-white truncate">{engineContract(p)}</p>
            <SideBadge side="long" />
            <span className="flex items-center gap-1 text-[10px] text-green-400 border border-green-500/20 rounded px-1.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" aria-hidden />
              {E.runningBadge}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {E.entered} {formatDateTime(p.openedAt)} · {E.held} {heldTime(p.openedAt, new Date().toISOString())} · {lotsLabel(p.qty, p.lotSize)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-gray-500">Entry</p>
          <p className="text-sm font-semibold text-white">{formatIndianCurrency(p.entryPrice)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
        <span className="text-gray-500">🎯 Target <span className="text-green-400 font-medium">{p.target != null ? formatIndianCurrency(p.target) : "—"}</span></span>
        <span className="text-gray-500">⛔ Stop <span className="text-red-400 font-medium">{p.stopLoss != null ? formatIndianCurrency(p.stopLoss) : "—"}</span></span>
        {p.currentPrice != null && (
          <span className="text-gray-500">Last <span className="text-gray-200 font-medium">{formatIndianCurrency(p.currentPrice)}</span></span>
        )}
      </div>
    </div>
  );
}

function EngineClosedCard({ t }: { t: EngineTrade }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white truncate">{engineContract(t)}</p>
            <SideBadge side="long" />
            <EngineReasonBadge reason={t.exitReason} />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {E.entered} {formatDateTime(t.openedAt)} · {E.exited} {formatDateTime(t.closedAt)} · {E.held} {heldTime(t.openedAt, t.closedAt)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatIndianCurrency(t.entryPrice)} → {formatIndianCurrency(t.exitPrice)} · {lotsLabel(t.qty, t.lotSize)} · <span className="text-gray-400">{t.strategy}</span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold ${getPnLColor(t.net)}`}>{formatIndianCurrency(t.net, { sign: true })}</p>
          <p className="text-xs text-gray-500">{formatPercent(t.pnlPercent, { sign: true })}</p>
        </div>
      </div>
    </div>
  );
}

function EngineTradesSection({
  open,
  closed,
  loading,
}: {
  open: EngineOpenPosition[];
  closed: EngineTrade[];
  loading: boolean;
}) {
  const summary = useMemo(() => {
    const net = closed.reduce((s, t) => s + t.net, 0);
    const wins = closed.filter((t) => t.net > 0).length;
    const winRate = closed.length ? (wins / closed.length) * 100 : 0;
    return { count: closed.length, net, winRate };
  }, [closed]);

  return (
    <div className="bg-gray-900/40 border border-violet-500/20 rounded-xl md:rounded-2xl p-3 md:p-5 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm md:text-base font-semibold text-white">{E.title}</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">{E.subtitle}</p>
        </div>
        {!loading && closed.length > 0 && (
          <div className="flex items-center gap-3 text-xs shrink-0">
            <span className="text-gray-500">{summary.count} closed</span>
            <span className="text-gray-500">Win {formatPercent(summary.winRate)}</span>
            <span className={`font-semibold ${getPnLColor(summary.net)}`}>{formatIndianCurrency(summary.net, { sign: true })}</span>
          </div>
        )}
      </div>

      {/* OPEN (running) */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">{E.openTitle}</h3>
          <span className="text-[11px] text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">{open.length}</span>
        </div>
        {loading ? (
          <Skeleton variant="card" className="h-20" />
        ) : open.length === 0 ? (
          <p className="text-xs text-gray-500 py-3">{E.emptyOpen}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {open.map((p) => <EngineOpenCard key={p.id} p={p} />)}
          </div>
        )}
      </div>

      {/* CLOSED */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">{E.closedTitle}</h3>
          <span className="text-[11px] text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">{closed.length}</span>
        </div>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="card" className="h-20" />)}</div>
        ) : closed.length === 0 ? (
          <p className="text-xs text-gray-500 py-3">{E.emptyClosed}</p>
        ) : (
          <div className="space-y-2">
            {closed.map((t) => <EngineClosedCard key={t.id} t={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// --- small table/section primitives ---
function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl md:rounded-2xl p-3 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm md:text-base font-semibold text-white">{title}</h3>
        <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">{count}</span>
      </div>
      {children}
    </div>
  );
}

function Th({
  children,
  className = "",
  sortable,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  sortable?: boolean;
  onClick?: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={`py-2 px-2 font-medium ${className} ${sortable ? "cursor-pointer hover:text-gray-300 select-none" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-2.5 px-2 ${className}`}>{children}</td>;
}
