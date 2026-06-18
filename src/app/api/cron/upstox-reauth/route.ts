import { NextRequest } from "next/server";

/**
 * Daily Upstox re-auth reminder. Vercel Cron hits this each morning (~9:00 IST)
 * and emails a one-click "Reconnect Upstox" link. Upstox tokens expire daily
 * and have no refresh token, so a quick manual login is required; this makes it
 * a single click straight from the inbox.
 *
 * Email is sent via Resend's REST API (no SDK dependency). Required env:
 *   CRON_SECRET, RESEND_API_KEY, EMAIL_FROM, EMAIL_TO, NEXT_PUBLIC_APP_URL
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const to = process.env.EMAIL_TO;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;

  if (!apiKey || !from || !to) {
    return Response.json(
      { error: "Email not configured (RESEND_API_KEY / EMAIL_FROM / EMAIL_TO)" },
      { status: 503 }
    );
  }

  const reconnectUrl = `${appUrl}/api/broker/reconnect`;
  const html = `
    <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
      <h2 style="margin:0 0 8px">TradeShala — reconnect Upstox for today</h2>
      <p style="color:#555;margin:0 0 20px">Your Upstox access token expires daily. Tap the button to log in and resume live market data.</p>
      <a href="${reconnectUrl}"
         style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600">
        Reconnect Upstox
      </a>
      <p style="color:#888;font-size:12px;margin:20px 0 0">After logging in you'll be redirected back and live data will resume automatically.</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "TradeShala: reconnect Upstox for today's live data",
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return Response.json({ ok: false, error: `Email send failed: ${detail}` }, { status: 502 });
    }

    return Response.json({ ok: true, sentTo: to });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
