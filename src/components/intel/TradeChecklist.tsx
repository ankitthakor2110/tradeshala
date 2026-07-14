"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import type { ChecklistItem, ChecklistResult } from "@/types/intel";

const VERDICT_STYLE: Record<ChecklistResult["verdict"], { label: string; cls: string }> = {
  READY_TO_BUY: { label: "READY TO BUY", cls: "text-green-400 bg-green-500/15 border-green-500/30" },
  READY_TO_SELL: { label: "READY TO SELL", cls: "text-red-400 bg-red-500/15 border-red-500/30" },
  WAIT: { label: "WAIT", cls: "text-amber-400 bg-amber-500/15 border-amber-500/30" },
};

function Mark({ item }: { item: ChecklistItem }) {
  if (item.state === "na") return <span className="text-gray-600">○</span>;
  if (item.state === "pass") return <span className="text-green-400">✔</span>;
  return <span className="text-gray-500">✕</span>;
}

export default function TradeChecklist({ checklist }: { checklist: ChecklistResult }) {
  const v = VERDICT_STYLE[checklist.verdict];
  return (
    <Section
      title={INTEL_CONFIG.labels.checklist}
      provenance="derived"
      right={<span className={`rounded-full border px-3 py-1 text-xs font-bold ${v.cls}`}>{v.label}</span>}
      subtitle={`${checklist.longScore} long · ${checklist.shortScore} short of ${checklist.applicable} signals`}
    >
      <ul className="space-y-1.5">
        {checklist.items.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <Mark item={item} />
              <span className={item.state === "na" ? "text-gray-500" : "text-gray-200"}>{item.label}</span>
            </span>
            <span className="text-right text-[11px] text-gray-500">{item.detail}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
