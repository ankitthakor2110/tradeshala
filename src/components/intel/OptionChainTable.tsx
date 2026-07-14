"use client";

import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import { buildupClasses } from "./style";
import { buildupLabel } from "@/lib/intel/optionchain";
import { formatOI, formatPercent } from "@/utils/format";
import type { ClassifiedRow } from "@/types/intel";

function oiDelta(v: number | null, warming: boolean): string {
  if (warming || v == null) return "—";
  const s = formatOI(Math.abs(v));
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : "0";
}

function Buildup({ b }: { b: ClassifiedRow["ce"]["buildup"] }) {
  const { label } = buildupLabel(b);
  if (label === "—") return <span className="text-gray-600">—</span>;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${buildupClasses(b)}`}>{label}</span>;
}

export default function OptionChainTable({
  rows,
  underlying,
  warmingUp,
}: {
  rows: ClassifiedRow[];
  underlying: number;
  warmingUp: boolean;
}) {
  return (
    <Section
      title={INTEL_CONFIG.labels.chain}
      provenance="live"
      subtitle={warmingUp ? INTEL_CONFIG.labels.warmingUp : "ATM highlighted · buildup from session OI change"}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-right text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-gray-500">
              <th className="px-2 py-1.5 font-medium">Buildup</th>
              <th className="px-2 py-1.5 font-medium">ΔOI</th>
              <th className="px-2 py-1.5 font-medium">OI</th>
              <th className="px-2 py-1.5 font-medium">Vol</th>
              <th className="px-2 py-1.5 font-medium">IV</th>
              <th className="px-2 py-1.5 font-medium text-green-400">Call LTP</th>
              <th className="px-2 py-1.5 text-center font-semibold text-gray-300">Strike</th>
              <th className="px-2 py-1.5 font-medium text-red-400">Put LTP</th>
              <th className="px-2 py-1.5 font-medium">IV</th>
              <th className="px-2 py-1.5 font-medium">Vol</th>
              <th className="px-2 py-1.5 font-medium">OI</th>
              <th className="px-2 py-1.5 font-medium">ΔOI</th>
              <th className="px-2 py-1.5 font-medium">Buildup</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const callItm = r.strike < underlying;
              const putItm = r.strike > underlying;
              return (
                <tr
                  key={r.strike}
                  className={`border-t border-gray-800/70 ${r.isAtm ? "bg-violet-500/10 ring-1 ring-inset ring-violet-500/30" : ""}`}
                >
                  {/* CALL side */}
                  <td className={`px-2 py-1.5 text-left ${callItm ? "bg-green-500/5" : ""}`}>
                    <Buildup b={r.ce.buildup} />
                  </td>
                  <td className={`px-2 py-1.5 tabular-nums ${callItm ? "bg-green-500/5" : ""} ${(r.ce.oiChange ?? 0) > 0 ? "text-green-400" : (r.ce.oiChange ?? 0) < 0 ? "text-red-400" : "text-gray-400"}`}>
                    {oiDelta(r.ce.oiChange, warmingUp)}
                  </td>
                  <td className={`px-2 py-1.5 tabular-nums text-gray-300 ${callItm ? "bg-green-500/5" : ""}`}>{formatOI(r.ce.oi)}</td>
                  <td className={`px-2 py-1.5 tabular-nums text-gray-400 ${callItm ? "bg-green-500/5" : ""}`}>{formatOI(r.ce.volume)}</td>
                  <td className={`px-2 py-1.5 tabular-nums text-gray-400 ${callItm ? "bg-green-500/5" : ""}`}>{r.ce.iv ? formatPercent(r.ce.iv) : "—"}</td>
                  <td className={`px-2 py-1.5 tabular-nums font-medium text-green-300 ${callItm ? "bg-green-500/5" : ""}`}>{r.ce.ltp ? r.ce.ltp.toFixed(2) : "—"}</td>

                  {/* STRIKE */}
                  <td className="px-2 py-1.5 text-center font-semibold text-white tabular-nums">
                    {r.strike}
                    {r.isAtm && <span className="ml-1 rounded bg-violet-500/30 px-1 text-[9px] text-violet-200">ATM</span>}
                  </td>

                  {/* PUT side */}
                  <td className={`px-2 py-1.5 tabular-nums font-medium text-red-300 ${putItm ? "bg-red-500/5" : ""}`}>{r.pe.ltp ? r.pe.ltp.toFixed(2) : "—"}</td>
                  <td className={`px-2 py-1.5 tabular-nums text-gray-400 ${putItm ? "bg-red-500/5" : ""}`}>{r.pe.iv ? formatPercent(r.pe.iv) : "—"}</td>
                  <td className={`px-2 py-1.5 tabular-nums text-gray-400 ${putItm ? "bg-red-500/5" : ""}`}>{formatOI(r.pe.volume)}</td>
                  <td className={`px-2 py-1.5 tabular-nums text-gray-300 ${putItm ? "bg-red-500/5" : ""}`}>{formatOI(r.pe.oi)}</td>
                  <td className={`px-2 py-1.5 tabular-nums ${putItm ? "bg-red-500/5" : ""} ${(r.pe.oiChange ?? 0) > 0 ? "text-green-400" : (r.pe.oiChange ?? 0) < 0 ? "text-red-400" : "text-gray-400"}`}>
                    {oiDelta(r.pe.oiChange, warmingUp)}
                  </td>
                  <td className={`px-2 py-1.5 text-left ${putItm ? "bg-red-500/5" : ""}`}>
                    <Buildup b={r.pe.buildup} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
