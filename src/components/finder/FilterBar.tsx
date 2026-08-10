"use client";

import { FINDER_CONFIG } from "@/config/finder";
import type { FinderConfigState } from "@/hooks/useScreener";

interface FilterBarProps {
  config: FinderConfigState;
  setConfig: (patch: Partial<FinderConfigState>) => void;
  count: number;
}

/** Preset chips + noise floor + refresh-speed control for the screener. */
export default function FilterBar({ config, setConfig, count }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {FINDER_CONFIG.presets.map((p) => {
          const active = config.preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              title={p.hint}
              onClick={() => setConfig({ preset: p.key })}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-all active:scale-95 ${
                active
                  ? "border-violet-500 bg-violet-500/15 text-violet-300"
                  : "border-gray-700 bg-gray-800/60 text-gray-400 hover:border-violet-500/50 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-gray-500">{count} shown</span>

        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          Min move
          <select
            value={config.minAbsChangePct}
            onChange={(e) => setConfig({ minAbsChangePct: Number(e.target.value) })}
            className="cursor-pointer rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            {[0, 1, 2, 3, 5].map((v) => (
              <option key={v} value={v}>
                {v === 0 ? "Any" : `${v}%+`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-gray-400">
          Refresh
          <select
            value={config.refreshMs}
            onChange={(e) => setConfig({ refreshMs: Number(e.target.value) })}
            className="cursor-pointer rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            {FINDER_CONFIG.refresh.options.map((o) => (
              <option key={o.ms} value={o.ms}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label
          className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-300"
          title={FINDER_CONFIG.alerts.note}
        >
          <input
            type="checkbox"
            checked={config.alertsEnabled}
            onChange={(e) => setConfig({ alertsEnabled: e.target.checked })}
            className="cursor-pointer accent-violet-500"
          />
          {FINDER_CONFIG.alerts.toggleLabel}
        </label>

        {config.alertsEnabled && (
          <label className="flex items-center gap-1.5 text-xs text-gray-400">
            {FINDER_CONFIG.alerts.thresholdLabel}
            <select
              value={config.alertThreshold}
              onChange={(e) => setConfig({ alertThreshold: Number(e.target.value) })}
              className="cursor-pointer rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 transition-all focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            >
              {FINDER_CONFIG.alerts.thresholdOptions.map((v) => (
                <option key={v} value={v}>
                  {v}%+
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
