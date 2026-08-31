"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AutomationStatusCard from "@/components/auto/AutomationStatusCard";
import { getAutomationStatus, type AutomationStatus } from "@/services/auto-trade.service";

// Compact automation snapshot for the main dashboard (spec section 41). Renders
// nothing until we know the account is configured for auto-trading, so it never
// clutters the dashboard for users who don't use it.

export default function AutoTradingDashboardCard() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);

  useEffect(() => {
    let alive = true;
    getAutomationStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!status || !status.configured) return null;

  return (
    <Link href="/dashboard/auto" className="block">
      <AutomationStatusCard status={status} />
    </Link>
  );
}
