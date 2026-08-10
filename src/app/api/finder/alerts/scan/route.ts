import { createClient } from "@/lib/supabase/server";
import { telegramConfigured, sendTelegramAlert } from "@/lib/tv/notify";
import { filterOnCooldown, buildFinderAlertText, type FinderAlert } from "@/lib/finder/alerts";
import { FINDER_CONFIG } from "@/config/finder";

export const dynamic = "force-dynamic";

// Best-effort per-instance cooldown state: serverless cold starts reset it and
// separate instances don't share it, so an alert may occasionally repeat. That's
// acceptable for a paper-trading tool posting to one Telegram chat; a durable
// per-symbol table is the follow-up if exact-once delivery is ever needed.
const lastAlerted: Record<string, number> = {};

/**
 * Send Telegram alerts for movers the client flagged as crossing the threshold.
 * Session-gated. The threshold check is done client-side (pure `alertCandidates`)
 * and posted here; this route applies the shared cooldown and does the send. A
 * send failure never throws (see notify.ts) and never 500s the caller.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!telegramConfigured()) {
    return Response.json({ ok: false, reason: "telegram not configured" });
  }

  let candidates: FinderAlert[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.candidates)) {
      candidates = body.candidates
        .filter(
          (c: unknown): c is FinderAlert =>
            !!c &&
            typeof (c as FinderAlert).symbol === "string" &&
            typeof (c as FinderAlert).changePercent === "number" &&
            typeof (c as FinderAlert).ltp === "number"
        )
        .map((c: FinderAlert) => ({ symbol: c.symbol, changePercent: c.changePercent, ltp: c.ltp }));
    }
  } catch {
    /* empty/invalid body → nothing to alert */
  }

  if (candidates.length === 0) return Response.json({ ok: true, sent: 0 });

  const { send, nextLastAlerted } = filterOnCooldown(
    candidates,
    lastAlerted,
    Date.now(),
    FINDER_CONFIG.alerts.cooldownMs
  );
  for (const k of Object.keys(nextLastAlerted)) lastAlerted[k] = nextLastAlerted[k];

  if (send.length === 0) return Response.json({ ok: true, sent: 0, throttled: candidates.length });

  const result = await sendTelegramAlert(buildFinderAlertText(send));
  return Response.json({ ok: result.sent, sent: result.sent ? send.length : 0, detail: result.detail });
}
