"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
} from "recharts";
import { getPnLColor, getPnLBgColor } from "@/utils/colors";
import type { IndexData } from "@/types/database";

interface IndexCardProps {
  index: IndexData;
  currency: string;
  marketOpen: boolean;
  isLive: boolean;
  lastUpdated?: string | null;
}

function formatTimeAgo(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 10) return "Just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ago`;
}

export default function IndexCard({
  index,
  currency,
  marketOpen,
  isLive,
  lastUpdated,
}: IndexCardProps) {
  const sparkData = index.sparklineData.map((v) => ({ v }));

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">{index.name}</h3>
          <span
            className={`w-2 h-2 rounded-full ${marketOpen ? "bg-violet-400 animate-pulse" : "bg-red-400"}`}
          />
          {isLive ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="text-[10px] font-semibold bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded-full">
              Demo
            </span>
          )}
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${getPnLBgColor(index.isPositive ? 1 : -1)}`}
        >
          {index.isPositive ? "+" : "-"}
          {index.changePercent}%
        </span>
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
            <p className="text-[10px] text-gray-500 mt-1">
              Updated: {formatTimeAgo(lastUpdated, now)}
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
