"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
} from "recharts";
import { getPnLColor, getPnLBgColor } from "@/utils/colors";
import { timeAgo } from "@/utils/format";
import LiveBadge from "@/components/ui/LiveBadge";
import type { IndexData } from "@/types/database";

interface IndexCardProps {
  index: IndexData;
  currency: string;
  marketOpen: boolean;
  isLive: boolean;
  lastUpdated?: string | null;
  source?: string | null;
}

function getDataSource(isLive: boolean, source: string | null): "dhan" | "upstox" | "cache" | "demo" {
  if (!isLive) return "demo";
  if (source === "dhan") return "dhan";
  if (source === "upstox") return "upstox";
  return "cache";
}

export default function IndexCard({
  index,
  currency,
  marketOpen,
  isLive,
  lastUpdated,
  source,
}: IndexCardProps) {
  const sparkData = index.sparklineData.map((v) => ({ v }));

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  const dataSource = getDataSource(isLive, source ?? null);
  const isLiveSource = dataSource === "dhan" || dataSource === "upstox";

  return (
    <div
      className={`bg-gray-900 border rounded-xl p-5 ${
        isLiveSource && marketOpen
          ? "border-green-500/20 ring-1 ring-green-500/10"
          : "border-gray-800"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">{index.name}</h3>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${getPnLBgColor(index.isPositive ? 1 : -1)}`}
          >
            {index.isPositive ? "+" : "-"}
            {index.changePercent}%
          </span>
        </div>
        <LiveBadge source={dataSource} lastUpdated={lastUpdated ?? null} />
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-bold text-white">
            {currency}
            {index.value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
          <p
            className={`text-sm mt-0.5 ${getPnLColor(index.isPositive ? 1 : -1)}`}
          >
            {index.isPositive ? "+" : ""}
            {index.change.toFixed(2)} ({index.isPositive ? "+" : "-"}
            {index.changePercent}%)
          </p>
          {lastUpdated && (
            <p className="text-[10px] text-gray-600 mt-1">
              {timeAgo(lastUpdated)}
            </p>
          )}
        </div>
        <div className="w-24 h-12" suppressHydrationWarning>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData}>
              <YAxis domain={["dataMin", "dataMax"]} hide />
              <Line
                type="monotone"
                dataKey="v"
                stroke={index.isPositive ? "#22c55e" : "#ef4444"}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function IndexCardSkeleton() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-20 bg-gray-800 rounded" />
          <div className="h-4 w-12 bg-gray-800 rounded-full" />
        </div>
        <div className="h-4 w-10 bg-gray-800 rounded" />
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="h-8 w-36 bg-gray-800 rounded mb-1" />
          <div className="h-4 w-28 bg-gray-800 rounded" />
        </div>
        <div className="w-24 h-12 bg-gray-800 rounded" />
      </div>
    </div>
  );
}
