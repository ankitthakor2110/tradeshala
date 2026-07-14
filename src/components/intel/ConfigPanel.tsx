"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import type { IntelConfigState } from "@/hooks/useIntelData";

function Group<T extends number>({
  label,
  value,
  options,
  onChange,
  render,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-gray-400">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
                active
                  ? "border-violet-500/50 bg-violet-500/20 text-violet-200"
                  : "border-gray-700 bg-gray-800/40 text-gray-400 hover:border-gray-600 hover:text-gray-200"
              }`}
            >
              {render(opt)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ConfigPanel({
  config,
  setConfig,
}: {
  config: IntelConfigState;
  setConfig: (patch: Partial<IntelConfigState>) => void;
}) {
  return (
    <Section title={INTEL_CONFIG.labels.config} subtitle="Preferences are saved on this device">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Group
          label="Refresh speed"
          value={config.refreshMs}
          options={INTEL_CONFIG.refresh.options.map((o) => o.ms)}
          onChange={(ms) => setConfig({ refreshMs: ms })}
          render={(ms) => INTEL_CONFIG.refresh.options.find((o) => o.ms === ms)?.label ?? `${ms}ms`}
        />
        <Group
          label="Strikes each side of ATM"
          value={config.atmRange}
          options={INTEL_CONFIG.chain.atmRangeOptions}
          onChange={(n) => setConfig({ atmRange: n })}
          render={(n) => `±${n}`}
        />
        <Group
          label="Setup confidence threshold"
          value={config.confidenceThreshold}
          options={INTEL_CONFIG.setups.confidenceThresholdOptions}
          onChange={(n) => setConfig({ confidenceThreshold: n })}
          render={(n) => `${n}%`}
        />
      </div>
      <p className="mt-4 text-[11px] text-gray-600">{INTEL_CONFIG.disclaimers.oiSession}</p>
    </Section>
  );
}
