export async function GET() {
  const check = (key: string): boolean => {
    const val = process.env[key];
    return !!(val && !val.startsWith("your_"));
  };

  return Response.json({
    vars: [
      { name: "DHAN_CLIENT_ID", configured: check("DHAN_CLIENT_ID"), requiredFor: "DhanHQ" },
      { name: "DHAN_ACCESS_TOKEN", configured: check("DHAN_ACCESS_TOKEN"), requiredFor: "DhanHQ" },
      { name: "UPSTOX_API_KEY", configured: check("UPSTOX_API_KEY"), requiredFor: "Upstox" },
      { name: "UPSTOX_API_SECRET", configured: check("UPSTOX_API_SECRET"), requiredFor: "Upstox" },
      { name: "UPSTOX_ACCESS_TOKEN", configured: check("UPSTOX_ACCESS_TOKEN"), requiredFor: "Upstox" },
      { name: "NEXT_PUBLIC_APP_URL", configured: check("NEXT_PUBLIC_APP_URL"), requiredFor: "OAuth" },
      { name: "NEXT_PUBLIC_SUPABASE_URL", configured: check("NEXT_PUBLIC_SUPABASE_URL"), requiredFor: "Database" },
      { name: "MARKET_DATA_PRIMARY", configured: check("MARKET_DATA_PRIMARY"), requiredFor: "Config", value: process.env.MARKET_DATA_PRIMARY ?? "not set" },
      { name: "MARKET_DATA_FALLBACK", configured: check("MARKET_DATA_FALLBACK"), requiredFor: "Config", value: process.env.MARKET_DATA_FALLBACK ?? "not set" },
    ],
  });
}
