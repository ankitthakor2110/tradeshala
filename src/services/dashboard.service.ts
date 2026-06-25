import { dashboardConfig } from "@/config/dashboard";

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

// (Removed getPortfolioStats — it read the unused `portfolios` table and had no
// callers. The dashboard + portfolio pages derive real stats from the live
// positions summary + virtual_balance instead.)
