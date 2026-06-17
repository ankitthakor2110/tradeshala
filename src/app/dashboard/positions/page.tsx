"use client";

import { useState, useCallback, useMemo, useEffect, useRef, Fragment, type ReactNode } from "react";
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
import { usePositions, type PositionView } from "@/hooks/usePositions";
import { closePosition, addToPosition } from "@/services/trade-engine.service";
import { getRecentOrders, setPositionRisk } from "@/services/positions.service";
import { getOptionGreeks, type OptionGreeks } from "@/services/market-data.service";
import { showToast } from "@/components/ui/Toast";
import type { Order } from "@/types/database";

// --- Local types ---
interface ChartPoint {
  date: string;
  daily: number;
  cumulative: number;
}

type ChartPeriod = "Today" | "1W" | "1M" | "3M";
type PnLFilter = "all" | "profit" | "loss";
type ActiveTab = "open" | "closed";

// Builds the realized-P&L trend from closed positions, grouped by close date
// and filtered to the selected period. Replaces the old mock series.
function buildPnLSeries(closed: PositionView[], period: ChartPeriod): ChartPoint[] {
  const now = new Date();
  const cutoff = new Date(now);
  if (period === "Today") cutoff.setHours(0, 0, 0, 0);
  else if (period === "1W") cutoff.setDate(now.getDate() - 7);
  else if (period === "1M") cutoff.setDate(now.getDate() - 30);
  else cutoff.setDate(now.getDate() - 90); // 3M

  const byDay = new Map<string, number>();
  for (const p of closed) {
    if (!p.closed_at) continue;
    const d = new Date(p.closed_at);
    if (d < cutoff) continue;
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + p.realized_pnl);
  }

  let cumulative = 0;
  return Array.from(byDay.keys())
    .sort()
    .map((key) => {
      const daily = Math.round((byDay.get(key) ?? 0) * 100) / 100;
      cumulative = Math.round((cumulative + daily) * 100) / 100;
      const date = new Date(`${key}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      });
      return { date, daily, cumulative };
    });
}

// --- Helpers ---
function getInstrumentLabel(p: PositionView): string {
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

type SortKey = "symbol" | "qty" | "ltp" | "invested" | "value" | "daypnl" | "pnl" | "pnlpct";

// Maps a column header to the field it sorts by (headers not listed aren't sortable).
const SORT_BY_HEADER: Record<string, SortKey> = {
  Instrument: "symbol",
  Qty: "qty",
  LTP: "ltp",
  Invested: "invested",
  "Current Value": "value",
  "Day P&L": "daypnl",
  "Unrealized P&L": "pnl",
  "P&L %": "pnlpct",
};

function sortValue(p: PositionView, key: SortKey): number | string {
  switch (key) {
    case "symbol": return p.symbol;
    case "qty": return p.quantity;
    case "ltp": return p.current_price;
    case "invested": return p.total_invested;
    case "value": return p.current_value;
    case "daypnl": return p.day_pnl ?? 0;
    case "pnl": return p.unrealized_pnl ?? 0;
    case "pnlpct": return p.pnl_percent;
  }
}

function daysToExpiry(expiry: string | null): number | null {
  if (!expiry) return null;
  const d = new Date(`${expiry}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function pnlHealth(pnl: number): { label: string; cls: string } {
  if (pnl > 0) return { label: "In profit", cls: "bg-green-500/10 text-green-400" };
  if (pnl < 0) return { label: "In loss", cls: "bg-red-500/10 text-red-400" };
  return { label: "Flat", cls: "bg-gray-700/40 text-gray-400" };
}

function expiryChip(dte: number | null): { label: string; cls: string } | null {
  if (dte === null) return null;
  if (dte < 0) return { label: "Expired", cls: "bg-gray-700/40 text-gray-400" };
  if (dte <= 2) return { label: `${dte}d to expiry`, cls: "bg-amber-500/10 text-amber-400" };
  return { label: `${dte}d left`, cls: "bg-gray-700/40 text-gray-400" };
}

// Option breakeven = strike ± premium; equity breakeven = average price.
function breakeven(p: PositionView): number {
  if (p.instrument_type === "CE") return (p.strike_price ?? 0) + p.average_price;
  if (p.instrument_type === "PE") return (p.strike_price ?? 0) - p.average_price;
  return p.average_price;
}

// Partial-close qty for a preset fraction, kept to whole lots for derivatives.
function lotAlignedQty(fraction: number, p: PositionView): number {
  const raw = Math.round(p.quantity * fraction);
  if (p.instrument_type === "EQ" || p.lot_size <= 1) {
    return Math.max(1, Math.min(p.quantity, raw));
  }
  const lots = Math.max(1, Math.round(raw / p.lot_size));
  return Math.min(p.quantity, lots * p.lot_size);
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

// Builds a CSV and triggers a browser download (client-only).
function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const content = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Briefly tints its content green/red when the numeric value changes (live tick).
function FlashValue({ value, children }: { value: number; children: ReactNode }) {
  const [flash, setFlash] = useState<"up" | "down" | "">("");
  const prev = useRef(value);
  useEffect(() => {
    if (value === prev.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flash on external price tick
    setFlash(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = setTimeout(() => setFlash(""), 600);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <span
      className={`rounded px-1 transition-colors duration-300 ${
        flash === "up" ? "bg-green-500/25" : flash === "down" ? "bg-red-500/25" : ""
      }`}
    >
      {children}
    </span>
  );
}

// Shared expandable detail (breakeven, DTE, partial close, fills) — used by both
// the desktop table row and the mobile card.
function PositionDetail({
  p,
  onClose,
  onAdd,
  onSaveRisk,
  closing,
  adding,
  savingRisk,
  fills,
  fillsLoading,
  greeks,
}: {
  p: PositionView;
  onClose: (qty: number) => void;
  onAdd: (qty: number) => void;
  onSaveRisk: (fields: { stop_loss: number | null; target: number | null; alert_price: number | null }) => void;
  closing: boolean;
  adding: boolean;
  savingRisk: boolean;
  fills: Order[];
  fillsLoading: boolean;
  greeks: OptionGreeks | null;
}) {
  const [closeQty, setCloseQty] = useState(p.quantity);
  const [addQty, setAddQty] = useState(p.instrument_type === "EQ" ? 1 : p.lot_size || 1);
  const [sl, setSl] = useState(p.stop_loss != null ? String(p.stop_loss) : "");
  const [tgt, setTgt] = useState(p.target != null ? String(p.target) : "");
  const [alertPrice, setAlertPrice] = useState(p.alert_price != null ? String(p.alert_price) : "");
  const numOrNull = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
        <div>
          <p className="text-gray-500">Breakeven</p>
          <p className="text-white font-medium">{formatIndianCurrency(breakeven(p))}</p>
        </div>
        {p.instrument_type !== "EQ" && (
          <div>
            <p className="text-gray-500">Days to expiry</p>
            <p className="text-white font-medium">
              {daysToExpiry(p.expiry_date) === null ? "—" : `${daysToExpiry(p.expiry_date)}d`}
            </p>
          </div>
        )}
        <div>
          <p className="text-gray-500">Day P&L</p>
          <p className={`font-medium ${getPnLColor(p.day_pnl ?? 0)}`}>{formatIndianCurrency(p.day_pnl ?? 0, { sign: true })}</p>
        </div>
        <div>
          <p className="text-gray-500">Avg / LTP</p>
          <p className="text-white font-medium">{formatIndianCurrency(p.average_price)} / {formatIndianCurrency(p.current_price)}</p>
        </div>
        <div>
          <p className="text-gray-500">Opened</p>
          <p className="text-white font-medium">{formatDate(p.opened_at)}</p>
        </div>
      </div>

      {p.instrument_type !== "EQ" && greeks && (
        <div className="grid grid-cols-3 gap-3 text-xs mb-3 bg-gray-800/40 rounded-lg p-2">
          <div><p className="text-gray-500">Delta</p><p className="text-white font-medium">{greeks.delta.toFixed(2)}</p></div>
          <div><p className="text-gray-500">Theta</p><p className="text-white font-medium">{greeks.theta.toFixed(2)}</p></div>
          <div><p className="text-gray-500">IV</p><p className="text-white font-medium">{greeks.iv.toFixed(2)}%</p></div>
        </div>
      )}

      {/* Add / average */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-gray-400">Add qty:</span>
        <input
          type="number"
          min={1}
          value={addQty}
          onChange={(e) => setAddQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className={`w-20 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-white ${INTERACTION_CLASSES.formInput}`}
        />
        <button
          onClick={() => onAdd(addQty)}
          disabled={adding}
          className="text-xs px-3 py-1 rounded-md border border-green-500/40 text-green-400 hover:bg-green-500 hover:text-white hover:border-green-500 cursor-pointer active:scale-95 transition-all duration-200 flex items-center gap-1.5"
        >
          {adding ? <ButtonLoader /> : null}
          Add (market buy)
        </button>
      </div>

      {/* Partial / full close */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-gray-400">Close qty:</span>
        {[0.25, 0.5, 1].map((f) => (
          <button
            key={f}
            onClick={() => setCloseQty(lotAlignedQty(f, p))}
            className="text-[11px] px-2 py-1 rounded-md bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer active:scale-95 transition-all duration-200"
          >
            {Math.round(f * 100)}%
          </button>
        ))}
        <input
          type="number"
          min={1}
          max={p.quantity}
          value={closeQty}
          onChange={(e) => setCloseQty(Math.max(1, Math.min(p.quantity, parseInt(e.target.value, 10) || 1)))}
          className={`w-20 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-white ${INTERACTION_CLASSES.formInput}`}
        />
        <span className="text-xs text-gray-500">/ {p.quantity}</span>
        <button
          onClick={() => onClose(closeQty)}
          disabled={closing}
          className={`${INTERACTION_CLASSES.dangerButton} text-xs text-white px-3 py-1 rounded-md flex items-center gap-1.5`}
        >
          {closing ? <ButtonLoader /> : null}
          Close {closeQty >= p.quantity ? "all" : closeQty}
        </button>
      </div>

      {/* SL / Target / Alert */}
      <div className="flex flex-wrap items-end gap-2 mb-1">
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">Stop-loss</p>
          <input type="number" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="—" className={`w-24 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-white ${INTERACTION_CLASSES.formInput}`} />
        </div>
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">Target</p>
          <input type="number" value={tgt} onChange={(e) => setTgt(e.target.value)} placeholder="—" className={`w-24 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-white ${INTERACTION_CLASSES.formInput}`} />
        </div>
        <div>
          <p className="text-[10px] text-gray-500 mb-0.5">Alert</p>
          <input type="number" value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)} placeholder="—" className={`w-24 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-xs text-white ${INTERACTION_CLASSES.formInput}`} />
        </div>
        <button
          onClick={() => onSaveRisk({ stop_loss: numOrNull(sl), target: numOrNull(tgt), alert_price: numOrNull(alertPrice) })}
          disabled={savingRisk}
          className={`${INTERACTION_CLASSES.secondaryButton} text-xs text-gray-200 px-3 py-1.5 rounded-md flex items-center gap-1.5`}
        >
          {savingRisk ? <ButtonLoader /> : null}
          Save
        </button>
      </div>
      <p className="text-[10px] text-gray-600 mb-3">SL/Target auto-close while this page is open.</p>

      <div>
        <p className="text-xs text-gray-400 mb-1">Recent fills</p>
        {fillsLoading ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : fills.length === 0 ? (
          <p className="text-xs text-gray-500">No fills found</p>
        ) : (
          <div className="space-y-1 max-w-md">
            {fills.map((o) => (
              <div key={o.id} className="flex items-center justify-between text-xs gap-3">
                <span className={o.trade_type === "BUY" ? "text-green-400" : "text-red-400"}>
                  {o.trade_type} {o.executed_quantity ?? o.quantity}
                </span>
                <span className="text-gray-300">{formatIndianCurrency(o.executed_price ?? o.price ?? 0)}</span>
                <span className="text-gray-500">{timeAgo(o.executed_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Page ---
export default function PositionsPage() {
  const mounted = useIsMounted();
  const {
    open: openPositions,
    closed: closedPositions,
    summary,
    loading,
    userId,
    isLive,
    refresh,
  } = usePositions();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("open");
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("1M");
  const [closingId, setClosingId] = useState<string | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);
  const [closingAll, setClosingAll] = useState(false);
  const [filterPnL, setFilterPnL] = useState<PnLFilter>("all");
  const [lastUpdated, setLastUpdated] = useState<string>(
    new Date().toISOString()
  );

  const chartData = useMemo(
    () => buildPnLSeries(closedPositions, chartPeriod),
    [closedPositions, chartPeriod]
  );

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("pnl");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [savingRiskId, setSavingRiskId] = useState<string | null>(null);
  const [fills, setFills] = useState<Order[]>([]);
  const [fillsLoading, setFillsLoading] = useState(false);
  const [greeks, setGreeks] = useState<OptionGreeks | null>(null);
  const triggeredRef = useRef<Set<string>>(new Set());
  const alertedRef = useRef<Set<string>>(new Set());
  const prevPriceRef = useRef<Map<string, number>>(new Map());

  const toggleExpand = useCallback(
    async (p: PositionView) => {
      if (expandedId === p.id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(p.id);
      setFills([]);
      setGreeks(null);
      setFillsLoading(true);
      const [orders, g] = await Promise.all([
        userId ? getRecentOrders(userId, p.symbol) : Promise.resolve([]),
        p.instrument_type !== "EQ"
          ? getOptionGreeks(
              p.symbol,
              p.expiry_date,
              p.strike_price,
              p.instrument_type === "PE" ? "PE" : "CE"
            )
          : Promise.resolve(null),
      ]);
      setFills(orders);
      setGreeks(g);
      setFillsLoading(false);
    },
    [expandedId, userId]
  );

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevKey;
      }
      setSortDir(key === "symbol" ? "asc" : "desc");
      return key;
    });
  }, []);

  const displayedOpen = useMemo(() => {
    const q = search.trim().toUpperCase();
    const list = q
      ? openPositions.filter((p) => p.symbol.toUpperCase().includes(q))
      : openPositions;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "string") return dir * av.localeCompare(bv as string);
      return dir * ((av as number) - (bv as number));
    });
  }, [openPositions, search, sortKey, sortDir]);

  const exposure = useMemo(() => {
    const byUnderlying = new Map<string, number>();
    const byType: Record<string, number> = {};
    let total = 0;
    for (const p of openPositions) {
      const v = p.current_value;
      total += v;
      byUnderlying.set(p.symbol, (byUnderlying.get(p.symbol) ?? 0) + v);
      byType[p.instrument_type] = (byType[p.instrument_type] ?? 0) + v;
    }
    const underlyings = Array.from(byUnderlying.entries())
      .map(([symbol, value]) => ({ symbol, value, pct: total > 0 ? (value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
    return { total, underlyings, byType };
  }, [openPositions]);

  const openTotals = useMemo(
    () =>
      displayedOpen.reduce(
        (t, p) => ({
          invested: t.invested + p.total_invested,
          value: t.value + p.current_value,
          dayPnl: t.dayPnl + (p.day_pnl ?? 0),
          pnl: t.pnl + (p.unrealized_pnl ?? 0),
        }),
        { invested: 0, value: 0, dayPnl: 0, pnl: 0 }
      ),
    [displayedOpen]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setLastUpdated(new Date().toISOString());
    setRefreshing(false);
  }, [refresh]);

  const handleClosePosition = useCallback(
    async (positionId: string, qty?: number) => {
      if (!userId) return;
      setClosingId(positionId);
      const res = await closePosition(positionId, userId, qty);
      if (!res.success) showToast(res.message, "error");
      await refresh();
      setLastUpdated(new Date().toISOString());
      setClosingId(null);
      setConfirmCloseId(null);
      setExpandedId(null);
    },
    [userId, refresh]
  );

  const handleAdd = useCallback(
    async (positionId: string, qty: number) => {
      if (!userId) return;
      setAddingId(positionId);
      const res = await addToPosition(positionId, userId, qty);
      showToast(res.success ? res.message : res.message, res.success ? "success" : "error");
      await refresh();
      setLastUpdated(new Date().toISOString());
      setAddingId(null);
    },
    [userId, refresh]
  );

  const handleSaveRisk = useCallback(
    async (
      positionId: string,
      fields: { stop_loss: number | null; target: number | null; alert_price: number | null }
    ) => {
      setSavingRiskId(positionId);
      const ok = await setPositionRisk(positionId, fields);
      showToast(ok ? "Risk levels saved" : "Failed to save risk levels", ok ? "success" : "error");
      // Re-arm triggers/alerts for the new levels.
      triggeredRef.current.delete(positionId);
      alertedRef.current.delete(positionId);
      await refresh();
      setSavingRiskId(null);
    },
    [refresh]
  );

  // Client-side GTT: while this page is open, auto-close on SL/Target and toast
  // on alert crossings, driven by the live price overlay.
  useEffect(() => {
    for (const p of openPositions) {
      const ltp = p.current_price;
      if (!triggeredRef.current.has(p.id)) {
        const hitSL = p.stop_loss != null && ltp <= p.stop_loss;
        const hitTarget = p.target != null && ltp >= p.target;
        if (hitSL || hitTarget) {
          triggeredRef.current.add(p.id);
          showToast(`${p.symbol}: ${hitSL ? "Stop-loss" : "Target"} hit — closing`, hitSL ? "error" : "success");
          // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-close on live price cross
          handleClosePosition(p.id);
        }
      }
      const prev = prevPriceRef.current.get(p.id);
      if (p.alert_price != null && prev !== undefined && !alertedRef.current.has(p.id)) {
        const crossed =
          (prev < p.alert_price && ltp >= p.alert_price) ||
          (prev > p.alert_price && ltp <= p.alert_price);
        if (crossed) {
          alertedRef.current.add(p.id);
          showToast(`Alert: ${p.symbol} crossed ${formatIndianCurrency(p.alert_price)}`, "info");
        }
      }
      prevPriceRef.current.set(p.id, ltp);
    }
  }, [openPositions, handleClosePosition]);

  const handleCloseAll = useCallback(async () => {
    if (!userId) return;
    setClosingAll(true);
    for (const p of openPositions) {
      const res = await closePosition(p.id, userId);
      if (!res.success) showToast(`${p.symbol}: ${res.message}`, "error");
    }
    await refresh();
    setLastUpdated(new Date().toISOString());
    setClosingAll(false);
    setConfirmCloseId(null);
  }, [userId, openPositions, refresh]);

  const getFilteredClosed = useCallback((): PositionView[] => {
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

  const searchQ = search.trim().toUpperCase();
  const filteredClosed = getFilteredClosed().filter(
    (p) => !searchQ || p.symbol.toUpperCase().includes(searchQ)
  );

  // When grouped, cluster open rows by underlying and precompute group subtotals.
  const renderOpen = grouped
    ? [...displayedOpen].sort((a, b) => a.symbol.localeCompare(b.symbol))
    : displayedOpen;
  const groupSubtotals = new Map<string, { pnl: number; dayPnl: number; count: number }>();
  if (grouped) {
    for (const p of displayedOpen) {
      const g = groupSubtotals.get(p.symbol) ?? { pnl: 0, dayPnl: 0, count: 0 };
      g.pnl += p.unrealized_pnl ?? 0;
      g.dayPnl += p.day_pnl ?? 0;
      g.count += 1;
      groupSubtotals.set(p.symbol, g);
    }
  }

  const handleExport = () => {
    if (activeTab === "open") {
      downloadCsv(
        "open-positions.csv",
        ["Symbol", "Type", "Strike", "Expiry", "Qty", "Avg Price", "LTP", "Invested", "Current Value", "Day P&L", "Unrealized P&L", "P&L %"],
        displayedOpen.map((p) => [
          p.symbol, p.instrument_type, p.strike_price ?? "", p.expiry_date ?? "",
          p.quantity, p.average_price, p.current_price, p.total_invested,
          p.current_value, p.day_pnl ?? 0, p.unrealized_pnl ?? 0, p.pnl_percent.toFixed(2),
        ])
      );
    } else {
      downloadCsv(
        "closed-positions.csv",
        ["Symbol", "Type", "Qty", "Avg Price", "Exit Price", "Invested", "Exit Value", "Realized P&L", "P&L %", "Closed At"],
        filteredClosed.map((p) => [
          p.symbol, p.instrument_type, p.quantity, p.average_price, p.current_price,
          p.total_invested, p.current_value, p.realized_pnl, p.pnl_percent.toFixed(2), p.closed_at ?? "",
        ])
      );
    }
  };

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
          <LiveBadge source={isLive ? "upstox" : "cache"} lastUpdated={lastUpdated} />
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

      {/* Sticky compact summary */}
      {!loading && (
        <div className="sticky top-0 z-20 -mx-3 sm:mx-0 px-3 sm:px-4 py-2 bg-gray-950/90 backdrop-blur border-b border-gray-800 flex items-center gap-4 overflow-x-auto whitespace-nowrap text-xs rounded-b-lg">
          <span className="text-gray-400">Open <span className="text-white font-semibold">{summary.totalOpenPositions}</span></span>
          <span className="text-gray-400">Day <span className={`font-semibold ${getPnLColor(summary.todayTotalPnL)}`}>{formatIndianCurrency(summary.todayTotalPnL, { sign: true })}</span></span>
          <span className="text-gray-400">Unrealized <span className={`font-semibold ${getPnLColor(summary.openUnrealizedPnL)}`}>{formatIndianCurrency(summary.openUnrealizedPnL, { sign: true })} ({formatPercent(summary.openUnrealizedPnLPercent, { sign: true })})</span></span>
          <span className="text-gray-400">Overall <span className={`font-semibold ${getPnLColor(summary.overallPnL)}`}>{formatIndianCurrency(summary.overallPnL, { sign: true })}</span></span>
        </div>
      )}

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
                  value={formatPercent(summary.winRate)}
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

      {/* Exposure breakdown */}
      {!loading && openPositions.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl md:rounded-2xl p-3 md:p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm md:text-base font-semibold text-white">Exposure</h3>
            <span className="text-xs text-gray-400">
              Deployed {formatIndianCurrency(exposure.total, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="space-y-2">
            {exposure.underlyings.slice(0, 6).map((u) => (
              <div key={u.symbol}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-gray-300">{u.symbol}</span>
                  <span className="text-gray-400">
                    {formatIndianCurrency(u.value, { maximumFractionDigits: 0 })} ({formatPercent(u.pct)})
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(100, u.pct)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 pt-3 border-t border-gray-800 text-xs">
            {(["EQ", "CE", "PE", "FUT"] as const)
              .filter((t) => (exposure.byType[t] ?? 0) > 0)
              .map((t) => (
                <span key={t} className="text-gray-400">
                  {t}{" "}
                  <span className="text-white font-medium">
                    {formatIndianCurrency(exposure.byType[t], { maximumFractionDigits: 0 })}
                  </span>
                </span>
              ))}
          </div>
        </div>
      )}

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

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol..."
            className={`w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-9 py-2 text-sm text-white placeholder-gray-500 ${INTERACTION_CLASSES.formInput}`}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white cursor-pointer"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <button
          onClick={() => setGrouped((g) => !g)}
          className={`text-xs px-3 py-2 rounded-lg border cursor-pointer active:scale-95 transition-all duration-200 ${grouped ? "border-violet-500/50 text-violet-400 bg-violet-500/10" : "border-gray-700 text-gray-300 hover:border-violet-500/50"}`}
        >
          Group by underlying
        </button>
        <button
          onClick={handleExport}
          className="text-xs px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-violet-500/50 cursor-pointer active:scale-95 transition-all duration-200"
        >
          Export CSV
        </button>
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
            <>
              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {renderOpen.map((p, i, arr) => {
                  const pnl = p.unrealized_pnl ?? 0;
                  const health = pnlHealth(pnl);
                  const exp =
                    p.instrument_type !== "EQ"
                      ? expiryChip(daysToExpiry(p.expiry_date))
                      : null;
                  const newGroup = grouped && (i === 0 || arr[i - 1].symbol !== p.symbol);
                  return (
                    <Fragment key={p.id}>
                    {newGroup && (
                      <p className="text-xs text-gray-400 font-semibold pt-2 px-1">{p.symbol}</p>
                    )}
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-sm">{getInstrumentLabel(p)}</span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getInstrumentBadgeClass(p.instrument_type)}`}>{p.instrument_type}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-xs text-gray-500">{p.exchange}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${health.cls}`}>{health.label}</span>
                            {exp && <span className={`text-[10px] px-1.5 py-0.5 rounded ${exp.cls}`}>{exp.label}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <FlashValue value={p.current_price}>
                            <span className="text-sm font-semibold text-white">{formatIndianCurrency(p.current_price)}</span>
                          </FlashValue>
                          <p className={`text-[10px] inline-block px-1.5 py-0.5 rounded mt-1 ${getPnLBgColor(p.pnl_percent)}`}>
                            {p.pnl_percent >= 0 ? "▲" : "▼"} {formatPercent(p.pnl_percent, { sign: true })}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                        <div><p className="text-gray-500">Qty</p><p className="text-gray-200">{p.quantity}</p></div>
                        <div><p className="text-gray-500">Avg</p><p className="text-gray-200">{formatIndianCurrency(p.average_price)}</p></div>
                        <div><p className="text-gray-500">Invested</p><p className="text-gray-200">{formatIndianCurrency(p.total_invested)}</p></div>
                        <div><p className="text-gray-500">Day P&L</p><p className={getPnLColor(p.day_pnl ?? 0)}>{formatIndianCurrency(p.day_pnl ?? 0, { sign: true })}</p></div>
                        <div className="col-span-2"><p className="text-gray-500">Unrealized P&L</p><p className={getPnLColor(pnl)}>{formatIndianCurrency(pnl, { sign: true })}</p></div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={() => toggleExpand(p)} className="flex-1 text-xs text-gray-300 border border-gray-700 hover:border-violet-500/50 rounded-md py-1.5 cursor-pointer active:scale-95 transition-all duration-200">
                          {expandedId === p.id ? "Hide" : "Details"}
                        </button>
                        <button onClick={() => handleClosePosition(p.id)} disabled={closingId === p.id} className={`flex-1 text-xs text-red-400 border border-red-500/30 hover:bg-red-500 hover:text-white hover:border-red-500 rounded-md py-1.5 cursor-pointer active:scale-95 transition-all duration-200 ${closingId === p.id ? "opacity-50" : ""}`}>
                          Close
                        </button>
                      </div>
                      {expandedId === p.id && (
                        <div className="mt-3 border-t border-gray-800 pt-3">
                          <PositionDetail
                            p={p}
                            onClose={(qty) => handleClosePosition(p.id, qty)}
                            onAdd={(qty) => handleAdd(p.id, qty)}
                            onSaveRisk={(f) => handleSaveRisk(p.id, f)}
                            closing={closingId === p.id}
                            adding={addingId === p.id}
                            savingRisk={savingRiskId === p.id}
                            fills={fills}
                            fillsLoading={fillsLoading}
                            greeks={greeks}
                          />
                        </div>
                      )}
                    </div>
                    </Fragment>
                  );
                })}
                {renderOpen.length === 0 && (
                  <p className="text-center text-sm text-gray-500 py-6">No matching positions</p>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0">
                <div className="bg-gray-900 md:border md:border-gray-800 rounded-xl md:rounded-2xl overflow-hidden">
                  <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 bg-gray-900/50 border-b border-gray-800">
                      {POSITIONS_CONFIG.tableHeaders.open.map((h) => {
                        const key = SORT_BY_HEADER[h];
                        const active = key && sortKey === key;
                        return (
                          <th
                            key={h}
                            onClick={key ? () => toggleSort(key) : undefined}
                            className={`px-2 md:px-4 py-2 md:py-3 font-medium whitespace-nowrap ${key ? "cursor-pointer select-none hover:text-gray-300" : ""} ${active ? "text-violet-400" : ""}`}
                          >
                            {h}
                            {active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {renderOpen.map((p, i, arr) => {
                      const pnl = p.unrealized_pnl ?? 0;
                      const health = pnlHealth(pnl);
                      const exp =
                        p.instrument_type !== "EQ"
                          ? expiryChip(daysToExpiry(p.expiry_date))
                          : null;
                      const newGroup = grouped && (i === 0 || arr[i - 1].symbol !== p.symbol);
                      const gt = grouped ? groupSubtotals.get(p.symbol) : null;
                      return (
                        <Fragment key={p.id}>
                        {newGroup && gt && (
                          <tr className="bg-gray-800/40">
                            <td colSpan={10} className="px-3 md:px-4 py-1.5 text-xs">
                              <span className="text-gray-200 font-semibold">{p.symbol}</span>
                              <span className="text-gray-500"> · {gt.count} {gt.count === 1 ? "position" : "positions"}</span>
                              <span className={`ml-2 font-medium ${getPnLColor(gt.pnl)}`}>{formatIndianCurrency(gt.pnl, { sign: true })}</span>
                            </td>
                          </tr>
                        )}
                        <tr className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors duration-200">
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleExpand(p)}
                                className="text-gray-500 hover:text-violet-400 cursor-pointer shrink-0"
                                aria-label="Toggle position details"
                              >
                                <svg className={`w-3 h-3 transition-transform duration-200 ${expandedId === p.id ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                              </button>
                              <span className="font-medium text-white">
                                {getInstrumentLabel(p)}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getInstrumentBadgeClass(p.instrument_type)}`}
                              >
                                {p.instrument_type}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="text-xs text-gray-500">{p.exchange}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${health.cls}`}>{health.label}</span>
                              {exp && <span className={`text-[10px] px-1.5 py-0.5 rounded ${exp.cls}`}>{exp.label}</span>}
                            </div>
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">{p.quantity}</td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            {formatIndianCurrency(p.average_price)}
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                              <FlashValue value={p.current_price}>
                                <span className="text-white font-medium">
                                  {formatIndianCurrency(p.current_price)}
                                </span>
                              </FlashValue>
                            </div>
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            {formatIndianCurrency(p.total_invested)}
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                            {formatIndianCurrency(p.current_value)}
                          </td>
                          <td className={`px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm font-medium ${getPnLColor(p.day_pnl ?? 0)}`}>
                            {formatIndianCurrency(p.day_pnl ?? 0, { sign: true })}
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
                        {expandedId === p.id && (
                          <tr className="bg-gray-900/40 border-b border-gray-800/50">
                            <td colSpan={10} className="px-3 md:px-4 py-3">
                              <PositionDetail
                                p={p}
                                onClose={(qty) => handleClosePosition(p.id, qty)}
                                onAdd={(qty) => handleAdd(p.id, qty)}
                                onSaveRisk={(f) => handleSaveRisk(p.id, f)}
                                closing={closingId === p.id}
                                adding={addingId === p.id}
                                savingRisk={savingRiskId === p.id}
                                fills={fills}
                                fillsLoading={fillsLoading}
                                greeks={greeks}
                              />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-800 bg-gray-900/40 font-medium">
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs text-gray-400 whitespace-nowrap">
                        Total ({displayedOpen.length})
                      </td>
                      <td />
                      <td />
                      <td />
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                        {formatIndianCurrency(openTotals.invested)}
                      </td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm text-gray-300">
                        {formatIndianCurrency(openTotals.value)}
                      </td>
                      <td className={`px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm ${getPnLColor(openTotals.dayPnl)}`}>
                        {formatIndianCurrency(openTotals.dayPnl, { sign: true })}
                      </td>
                      <td className={`px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm ${getPnLColor(openTotals.pnl)}`}>
                        {formatIndianCurrency(openTotals.pnl, { sign: true })}
                      </td>
                      <td />
                      <td />
                    </tr>
                  </tfoot>
                </table>
                </div>
              </div>
            </>
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
        const best = closedPositions.reduce<PositionView | null>(
          (b, p) => (!b || (p.realized_pnl ?? 0) > (b.realized_pnl ?? 0) ? p : b),
          null
        );
        const worst = closedPositions.reduce<PositionView | null>(
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

