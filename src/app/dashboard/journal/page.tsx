"use client";

import { useCallback, useMemo, useState } from "react";
import { JOURNAL_CONFIG } from "@/config/journal";
import { INTERACTION_CLASSES } from "@/styles/interactions";
import { formatIndianCurrency, formatPercent, formatDate } from "@/utils/format";
import { getPnLColor } from "@/utils/colors";
import { useIsMounted } from "@/hooks/useIsMounted";
import { usePositions, type PositionView } from "@/hooks/usePositions";
import { setPositionJournal } from "@/services/positions.service";
import { showToast } from "@/components/ui/Toast";
import ButtonLoader from "@/components/ui/ButtonLoader";
import Skeleton from "@/components/ui/Skeleton";

type WinFilter = "all" | "wins" | "losses";

function contractLabel(p: PositionView): string {
  const dir = p.direction === "SHORT" ? " · SHORT" : "";
  if (p.instrument_type === "CE" || p.instrument_type === "PE") {
    const exp = p.expiry_date
      ? new Date(p.expiry_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
      : "";
    return `${p.symbol} ${p.strike_price ?? ""} ${p.instrument_type}${exp ? ` · ${exp}` : ""}${dir}`;
  }
  return `${p.symbol}${dir}`;
}

function holdingTime(open: string | null, close: string | null): string {
  if (!open || !close) return "—";
  const ms = new Date(close).getTime() - new Date(open).getTime();
  if (ms < 0) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

// R-multiple = realized P&L ÷ initial risk (entry vs stop-loss × qty). Null when
// no stop was recorded on the trade.
function rMultiple(p: PositionView): number | null {
  if (p.stop_loss == null) return null;
  const risk = Math.abs(p.average_price - p.stop_loss) * p.quantity;
  if (risk <= 0) return null;
  return p.realized_pnl / risk;
}

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

export default function JournalPage() {
  const mounted = useIsMounted();
  const { closed, loading, refresh } = usePositions();

  const [winFilter, setWinFilter] = useState<WinFilter>("all");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of closed) (p.tags ?? []).forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [closed]);

  const trades = useMemo(() => {
    const q = search.trim().toUpperCase();
    return closed.filter((p) => {
      if (q && !p.symbol.toUpperCase().includes(q)) return false;
      if (winFilter === "wins" && p.realized_pnl <= 0) return false;
      if (winFilter === "losses" && p.realized_pnl >= 0) return false;
      if (tagFilter && !(p.tags ?? []).includes(tagFilter)) return false;
      return true;
    });
  }, [closed, search, winFilter, tagFilter]);

  const stats = useMemo(() => {
    const pnls = trades.map((t) => t.realized_pnl);
    const wins = pnls.filter((p) => p > 0);
    const losses = pnls.filter((p) => p < 0);
    const grossWin = wins.reduce((s, p) => s + p, 0);
    const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0));
    const total = pnls.reduce((s, p) => s + p, 0);
    return {
      count: trades.length,
      net: total,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      expectancy: trades.length ? total / trades.length : 0,
    };
  }, [trades]);

  const handleExport = useCallback(() => {
    downloadCsv(
      "trade-journal.csv",
      ["Closed", "Contract", "Direction", "Qty", "Entry", "Exit", "P&L", "P&L %", "R", "Tags", "Notes"],
      trades.map((p) => [
        p.closed_at ?? "",
        contractLabel(p),
        p.direction,
        p.quantity,
        p.average_price,
        p.current_price,
        p.realized_pnl,
        p.pnl_percent.toFixed(2),
        rMultiple(p)?.toFixed(2) ?? "",
        (p.tags ?? []).join("|"),
        p.notes ?? "",
      ])
    );
  }, [trades]);

  if (!mounted) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-white">{JOURNAL_CONFIG.page.title}</h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">{JOURNAL_CONFIG.page.subtitle}</p>
        </div>
        {trades.length > 0 && (
          <button onClick={handleExport} className={`${INTERACTION_CLASSES.secondaryButton} text-sm text-gray-200 px-4 py-2 rounded-xl`}>
            Export CSV
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="card" className="h-20" />)
        ) : (
          <>
            <StatCard label="Trades" value={String(stats.count)} />
            <StatCard label="Win rate" value={formatPercent(stats.winRate)} />
            <StatCard label="Net P&L" value={formatIndianCurrency(stats.net, { sign: true })} tone={stats.net} />
            <StatCard label="Profit factor" value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)} />
            <StatCard label="Expectancy" value={formatIndianCurrency(stats.expectancy, { sign: true })} tone={stats.expectancy} />
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search symbol..."
          className={`flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 cursor-text ${INTERACTION_CLASSES.formInput}`}
        />
        <div className="flex gap-1 bg-gray-800/50 p-1 rounded-lg">
          {(["all", "wins", "losses"] as WinFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setWinFilter(f)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer transition-all duration-200 active:scale-95 ${
                winFilter === f ? "bg-violet-500 text-white" : "text-gray-400 hover:text-white"
              }`}
            >
              {JOURNAL_CONFIG.filters[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTagFilter(null)}
            className={`text-[11px] px-2.5 py-1 rounded-full border cursor-pointer active:scale-95 transition-all duration-200 ${
              tagFilter == null ? "bg-violet-500/20 text-violet-300 border-violet-500/40" : "bg-gray-900 text-gray-400 border-gray-800 hover:text-white"
            }`}
          >
            All tags
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter(t)}
              className={`text-[11px] px-2.5 py-1 rounded-full border cursor-pointer active:scale-95 transition-all duration-200 ${
                tagFilter === t ? "bg-violet-500/20 text-violet-300 border-violet-500/40" : "bg-gray-900 text-gray-400 border-gray-800 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Trades */}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="card" className="h-20" />)}</div>
      ) : trades.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">{JOURNAL_CONFIG.emptyState}</div>
      ) : (
        <div className="space-y-2">
          {trades.map((p) => (
            <TradeRow
              key={p.id}
              p={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onSaved={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const color = tone == null ? "text-white" : getPnLColor(tone);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

function TradeRow({
  p,
  expanded,
  onToggle,
  onSaved,
}: {
  p: PositionView;
  expanded: boolean;
  onToggle: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const r = rMultiple(p);
  const win = p.realized_pnl > 0;
  const [notes, setNotes] = useState(p.notes ?? "");
  const [tags, setTags] = useState<string[]>(p.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const addTagInput = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const save = async () => {
    setSaving(true);
    const ok = await setPositionJournal(p.id, { notes: notes || null, tags: tags.length ? tags : null });
    showToast(ok ? "Journal saved" : "Failed to save journal", ok ? "success" : "error");
    setSaving(false);
    if (ok) await onSaved();
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between gap-3 p-3 sm:p-4 cursor-pointer hover:bg-gray-800/40 transition-colors duration-200 text-left">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{contractLabel(p)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatDate(p.closed_at ?? p.opened_at)} · {holdingTime(p.opened_at, p.closed_at)} · {p.quantity} qty
          </p>
          {(p.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(p.tags ?? []).map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300">{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className={`text-sm font-bold ${getPnLColor(p.realized_pnl)}`}>{formatIndianCurrency(p.realized_pnl, { sign: true })}</p>
          <p className="text-xs text-gray-500">
            {formatPercent(p.pnl_percent, { sign: true })}{r != null ? ` · ${r >= 0 ? "+" : ""}${r.toFixed(2)}R` : ""}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-800 p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div><p className="text-gray-500">Entry</p><p className="text-white font-medium">{formatIndianCurrency(p.average_price)}</p></div>
            <div><p className="text-gray-500">Exit</p><p className="text-white font-medium">{formatIndianCurrency(p.current_price)}</p></div>
            <div><p className="text-gray-500">Direction</p><p className={`font-medium ${win ? "text-green-400" : "text-red-400"}`}>{p.direction}</p></div>
            <div><p className="text-gray-500">R multiple</p><p className="text-white font-medium">{r != null ? `${r.toFixed(2)}R` : "—"}</p></div>
          </div>

          {/* Tags */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {JOURNAL_CONFIG.suggestedTags.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`text-[11px] px-2 py-1 rounded-md cursor-pointer active:scale-95 transition-all duration-200 ${
                    tags.includes(t) ? "bg-violet-500/20 text-violet-300 border border-violet-500/40" : "bg-gray-800 text-gray-400 hover:text-white border border-transparent"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {tags.filter((t) => !(JOURNAL_CONFIG.suggestedTags as readonly string[]).includes(t)).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-violet-500/20 text-violet-300">
                  {t}
                  <button onClick={() => toggleTag(t)} className="text-violet-300/70 hover:text-white cursor-pointer" aria-label="Remove tag">✕</button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTagInput(); } }}
                placeholder="+ tag"
                className={`w-24 bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-[11px] text-white placeholder-gray-600 cursor-text ${INTERACTION_CLASSES.formInput}`}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs text-gray-400 mb-1.5">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="What was the setup? What did you learn?"
              className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 resize-none cursor-text ${INTERACTION_CLASSES.formInput}`}
            />
          </div>

          <button onClick={save} disabled={saving} className={`${INTERACTION_CLASSES.primaryButton} text-sm text-white px-4 py-2 rounded-lg flex items-center gap-2`}>
            {saving ? <ButtonLoader /> : null}
            Save journal
          </button>
        </div>
      )}
    </div>
  );
}
