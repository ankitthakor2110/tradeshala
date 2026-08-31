import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadConfigRow, loadCounters } from "@/services/auto-trade.server";
import { getMarketStatus } from "@/services/dashboard.service";

// Automation status (spec section 41): today's trades, P&L, open positions,
// consecutive losses, and daily-loss headroom for the current account.

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const cfg = await loadConfigRow(admin, user.id);
  const counters = await loadCounters(admin, user.id);

  const config = cfg?.config ?? null;
  const dailyLossRemaining =
    config != null
      ? Math.max(0, config.riskLimits.maxDailyLoss + Math.min(0, counters.realizedPnlToday))
      : null;

  return Response.json({
    configured: !!cfg,
    enabled: config?.enabled ?? false,
    mode: config?.mode ?? "MANUAL",
    dryRun: config?.dryRun ?? false,
    emergencyStopped: cfg?.emergencyStopped ?? false,
    marketOpen: getMarketStatus(),
    counters,
    limits: config?.riskLimits ?? null,
    dailyLossRemaining,
  });
}
