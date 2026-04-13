"use client";

import { useState, useEffect } from "react";
import { timeAgo } from "@/utils/format";

type DataSource = "dhan" | "upstox" | "cache" | "demo";

interface LiveBadgeProps {
  source: DataSource;
  lastUpdated: string | null;
  showSource?: boolean;
}

export default function LiveBadge({
  source,
  lastUpdated,
  showSource = false,
}: LiveBadgeProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  if (source === "dhan" || source === "upstox") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-xs text-green-400 font-medium">LIVE</span>
        {showSource && (
          <span className="text-xs text-gray-500">
            via {source === "dhan" ? "DhanHQ" : "Upstox"}
          </span>
        )}
      </div>
    );
  }

  if (source === "cache") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-yellow-500" />
        <span className="text-xs text-yellow-400 font-medium">CACHED</span>
        {lastUpdated && (
          <span className="text-xs text-gray-500">{timeAgo(lastUpdated)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-gray-500" />
      <span className="text-xs text-gray-400 font-medium">DEMO</span>
    </div>
  );
}
