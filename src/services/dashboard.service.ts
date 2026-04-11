import { createClient } from "@/lib/supabase/client";
import { dashboardConfig } from "@/config/dashboard";
import type { DashboardStats } from "@/types/database";

export function getMarketStatus(): boolean {
  const { openHour, openMinute, closeHour, closeMinute, timezone } =
    dashboardConfig.market;

  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone })
  );

  const day = now.getDay();
  if (day === 0 || day === 6) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const openAt = openHour * 60 + openMinute;
  const closeAt = closeHour * 60 + closeMinute;

  return minutes >= openAt && minutes <= closeAt;
}

export function getGreeting(): string {
  const { greeting, timezone } = {
    ...dashboardConfig,
    timezone: dashboardConfig.market.timezone,
  };

  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone })
  );

  const hour = now.getHours();
  if (hour < 12) return greeting.morning;
  if (hour < 17) return greeting.afternoon;
  return greeting.evening;
}

export async function getPortfolioStats(
  userId: string
): Promise<DashboardStats> {
  try {
    const supabase = createClient();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("virtual_balance")
      .eq("id", userId)
      .single<{ virtual_balance: number }>();

    if (profileError) {
      return dashboardConfig.mockStats;
    }

    const { data: holdings } = await supabase
      .from("portfolios")
      .select("quantity, avg_buy_price, current_price")
      .eq("user_id", userId)
      .returns<{ quantity: number; avg_buy_price: number; current_price: number }[]>();

    const virtualCash = profile?.virtual_balance ?? 1000000;
    let portfolioValue = 0;
    let totalCost = 0;

    if (holdings) {
      for (const h of holdings) {
        portfolioValue += h.quantity * h.current_price;
        totalCost += h.quantity * h.avg_buy_price;
      }
    }

    const totalPnL = portfolioValue - totalCost;
    const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

    return { virtualCash, portfolioValue, totalPnL, totalPnLPercent };
  } catch {
    return {
      virtualCash: 1000000,
      portfolioValue: 0,
      totalPnL: 0,
      totalPnLPercent: 0,
    };
  }
}
