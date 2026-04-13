import { healthCheck, getPrimaryProvider } from "@/lib/market-data";

function getMarketStatus(): "open" | "closed" | "pre-open" {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const day = now.getDay();
  if (day === 0 || day === 6) return "closed";

  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes >= 540 && minutes < 555) return "pre-open"; // 9:00-9:15
  if (minutes >= 555 && minutes <= 930) return "open"; // 9:15-15:30
  return "closed";
}

export async function GET() {
  try {
    const health = await healthCheck();

    return Response.json({
      dhan: health.dhan,
      upstox: health.upstox,
      primary: getPrimaryProvider(),
      marketStatus: getMarketStatus(),
    });
  } catch {
    return Response.json(
      { error: "Health check failed" },
      { status: 500 }
    );
  }
}
