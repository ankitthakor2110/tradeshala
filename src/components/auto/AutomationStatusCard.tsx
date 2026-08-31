"use client";

import { formatIndianCurrency } from "@/utils/format";
import { getPnLColor } from "@/utils/colors";
import { AUTO_TRADE_COPY } from "@/config/autoTrade";
import type { AutomationStatus } from "@/services/auto-trade.service";

// Automation dashboard (spec section 41): a compact live snapshot of today's
// automatic-trading activity and headroom against the configured limits.

const S = AUTO_TRADE_COPY.statusCard;

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
      <p className="text-[11px] text-gray-500 mb-1">{label}</p>
      <p className={`text-base sm:text-lg font-bold ${tone ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AutomationStatusCard({ status }: { status: AutomationStatus | null }) {
  if (!status) return null;

  const active = status.enabled && !status.emergencyStopped && status.mode !== "MANUAL";
  const stateLabel = status.emergencyStopped
    ? AUTO_TRADE_COPY.status.stoppedLabel
    : active
      ? AUTO_TRADE_COPY.status.activeLabel
      : AUTO_TRADE_COPY.status.offLabel;
  const stateTone = status.emergencyStopped
    ? "text-red-400"
    : active
      ? "text-green-400"
      : "text-gray-400";
  const dot = status.emergencyStopped ? "bg-red-500" : active ? "bg-green-500" : "bg-gray-500";

  const c = status.counters;
  const limits = status.limits;

  return (
    <div className="bg-gray-900/40 border border-violet-500/20 rounded-xl md:rounded-2xl p-3 md:p-5 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${dot} ${active ? "animate-pulse" : ""}`} aria-hidden />
          <h2 className={`text-sm md:text-base font-bold ${stateTone}`}>{stateLabel}</h2>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <span className="border border-gray-800 rounded-lg px-2 py-1">Mode: {status.mode}</span>
          {status.dryRun && <span className="border border-sky-500/30 text-sky-400 rounded-lg px-2 py-1">Dry Run</span>}
          <span className="border border-gray-800 rounded-lg px-2 py-1">
            {status.marketOpen ? "Market Open" : "Market Closed"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat
          label={S.todaysTrades}
          value={limits ? `${c.tradesToday} / ${limits.maxTradesPerDay}` : String(c.tradesToday)}
        />
        <Stat
          label={S.todaysPnl}
          value={formatIndianCurrency(c.realizedPnlToday, { sign: true })}
          tone={getPnLColor(c.realizedPnlToday)}
        />
        <Stat
          label={S.openPositions}
          value={limits ? `${c.openPositions} / ${limits.maxOpenPositions}` : String(c.openPositions)}
        />
        <Stat
          label={S.consecutiveLosses}
          value={limits ? `${c.consecutiveLosses} / ${limits.maxConsecutiveLosses}` : String(c.consecutiveLosses)}
          tone={c.consecutiveLosses > 0 ? "text-amber-400" : "text-white"}
        />
        <Stat
          label={S.dailyLossRemaining}
          value={status.dailyLossRemaining != null ? formatIndianCurrency(status.dailyLossRemaining) : "—"}
          sub={S.remaining}
        />
      </div>
    </div>
  );
}
