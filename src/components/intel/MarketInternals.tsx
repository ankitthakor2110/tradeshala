"use client";

import { useEffect, useState } from "react";
import Section from "./Section";
import { INTEL_CONFIG } from "@/config/intel";
import { getGainersLosers, getIndicesData } from "@/services/intel.service";
import { getPnLColor } from "@/utils/colors";
import { formatPercent } from "@/utils/format";
import type { StockGainerLoser } from "@/types/database";

interface Strength {
  name: string;
  changePercent: number;
}

export default function MarketInternals() {
  const [strengths, setStrengths] = useState<Strength[]>([]);
  const [gainers, setGainers] = useState<StockGainerLoser[]>([]);
  const [losers, setLosers] = useState<StockGainerLoser[]>([]);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [idx, gl] = await Promise.all([getIndicesData(), getGainersLosers()]);
      if (!active) return;
      const s: Strength[] = [];
      if (idx?.nifty50) s.push({ name: "NIFTY 50", changePercent: idx.nifty50.change_percent });
      if (idx?.bankNifty) s.push({ name: "BANK NIFTY", changePercent: idx.bankNifty.change_percent });
      if (idx?.sensex) s.push({ name: "SENSEX", changePercent: idx.sensex.change_percent });
      setStrengths(s);
      setGainers(gl?.gainers ?? []);
      setLosers(gl?.losers ?? []);
      setHasData(Boolean(idx || gl));
    };
    void load();
    const id = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  return (
    <Section
      title={INTEL_CONFIG.labels.internals}
      provenance={hasData ? "live" : "none"}
      subtitle="Index strength + movers (VIX / breadth / sector not fed — see below)"
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {strengths.map((s) => (
          <div key={s.name} className="rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">{s.name}</div>
            <div className={`mt-0.5 text-sm font-semibold tabular-nums ${getPnLColor(s.changePercent)}`}>
              {formatPercent(s.changePercent, { sign: true })}
            </div>
          </div>
        ))}
        {strengths.length === 0 && <p className="col-span-full text-sm text-gray-500">Index data unavailable.</p>}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-xs font-medium text-green-400">Top Gainers</div>
          <ul className="space-y-1">
            {gainers.slice(0, 5).map((g) => (
              <li key={g.symbol} className="flex justify-between text-xs">
                <span className="text-gray-200">{g.symbol}</span>
                <span className="text-green-400 tabular-nums">{formatPercent(g.changePercent, { sign: true })}</span>
              </li>
            ))}
            {gainers.length === 0 && <li className="text-xs text-gray-500">—</li>}
          </ul>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-red-400">Top Losers</div>
          <ul className="space-y-1">
            {losers.slice(0, 5).map((l) => (
              <li key={l.symbol} className="flex justify-between text-xs">
                <span className="text-gray-200">{l.symbol}</span>
                <span className="text-red-400 tabular-nums">{formatPercent(-Math.abs(l.changePercent), { sign: true })}</span>
              </li>
            ))}
            {losers.length === 0 && <li className="text-xs text-gray-500">—</li>}
          </ul>
        </div>
      </div>
    </Section>
  );
}
