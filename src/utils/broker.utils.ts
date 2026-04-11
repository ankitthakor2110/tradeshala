import { BROKERS } from "@/config/brokers";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const CALLBACK_PATH = "/api/broker/oauth/callback";

export function buildOAuthUrl(
  brokerId: string,
  apiKey: string,
  userId: string
): string | null {
  const broker = BROKERS.find((b) => b.id === brokerId);
  if (!broker || broker.authType !== "oauth") return null;

  const state = `${brokerId}:${userId}`;
  const redirectUri = broker.redirectUri ?? `${APP_URL}${CALLBACK_PATH}`;

  switch (brokerId) {
    case "upstox": {
      const params = new URLSearchParams({
        response_type: "code",
        client_id: apiKey,
        redirect_uri: redirectUri,
        state,
      });
      return `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`;
    }

    case "zerodha": {
      const params = new URLSearchParams({
        api_key: apiKey,
        v: "3",
      });
      return `https://kite.zerodha.com/connect/login?${params.toString()}`;
    }

    default:
      return null;
  }
}

export function isTokenExpired(tokenExpiry: string | null): boolean {
  if (!tokenExpiry) return false;
  return Date.now() >= new Date(tokenExpiry).getTime();
}

export function isTokenExpiringSoon(tokenExpiry: string | null): boolean {
  if (!tokenExpiry) return false;
  const diff = new Date(tokenExpiry).getTime() - Date.now();
  return diff > 0 && diff < 60 * 60 * 1000;
}

export function getTimeUntilExpiry(tokenExpiry: string | null): string {
  if (!tokenExpiry) return "Unknown";

  const diff = new Date(tokenExpiry).getTime() - Date.now();

  if (diff <= 0) return "Expired";

  const hours = Math.floor(diff / (60 * 60 * 1000));
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0 && mins > 0) return `${hours} hour${hours > 1 ? "s" : ""} ${mins} min${mins > 1 ? "s" : ""}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
  return `${mins} min${mins > 1 ? "s" : ""}`;
}

export function getMidnightIST(): Date {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);

  const tomorrow = new Date(istNow);
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  return new Date(tomorrow.getTime() - istOffsetMs);
}
