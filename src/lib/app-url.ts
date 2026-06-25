import type { NextRequest } from "next/server";

/**
 * Public origin (scheme + host) of the deployed app, derived from the INCOMING
 * REQUEST. On Vercel the public host arrives in `x-forwarded-host` and the
 * scheme in `x-forwarded-proto`; locally it's the `host` header. Falls back to
 * NEXT_PUBLIC_APP_URL, then the request URL's own origin.
 *
 * OAuth redirect URIs are built from THIS — not from NEXT_PUBLIC_APP_URL alone —
 * so the `redirect_uri` sent to Upstox/Zerodha always matches the exact domain
 * the user is on. A stale or misconfigured NEXT_PUBLIC_APP_URL (e.g. left as
 * http://localhost:3000 in production) can therefore never break the broker
 * login again (UDAPI100068). The only external requirement is that the broker
 * app has this same callback URL registered.
 */
export function getPublicOrigin(request: NextRequest): string {
  const fwdHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = fwdHost || request.headers.get("host")?.split(",")[0]?.trim();
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
    return `${proto}://${host}`;
  }
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env && !env.startsWith("your_")) return env.replace(/\/$/, "");
  return new URL(request.url).origin;
}
