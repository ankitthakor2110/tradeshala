import type { WebhookPayload } from "@/lib/tv/schema";
import type { ApplyResult } from "@/lib/tv/processor";
import type { OptionContractInfo } from "@/services/trade-engine.server";

// ============================================================================
// Telegram alerting for processed TradingView signals (server-only).
// ----------------------------------------------------------------------------
// Posts a message to a Telegram chat via the Bot API when a BUY/SELL signal is
// acted on (opened / closed / reversed). Credentials come from server-only env
// (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) — NEVER hardcode the token or import
// this into client code. A send failure must never fail the webhook, so the
// caller wraps this in try/catch; it also never throws on its own.
// ============================================================================

const TELEGRAM_API = "https://api.telegram.org";

/** True when both the bot token and chat id are configured. */
export function telegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN?.trim() && !!process.env.TELEGRAM_CHAT_ID?.trim();
}

/** Escape the five characters that matter for Telegram parse_mode=HTML. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Format a price without trailing noise (keeps up to 2 decimals). */
function fmtPrice(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(n);
}

/** Expiry ISO (e.g. "2026-09-05") → "05 Sep"; "" if unparseable. */
function fmtExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}

/**
 * Minimal entry message: just what to buy — side (CALL/PUT), the strike with its
 * expiry, and the live premium (LTP). Used when the engine resolved a concrete
 * contract for the signal (same strike-selection rules as the fill).
 */
function buildEntryText(
  _payload: WebhookPayload,
  applied: ApplyResult,
  c: OptionContractInfo
): string {
  const kind = c.optionType === "CE" ? "CALL" : "PUT";
  const head = applied.handled === "reversed" ? "🔄" : c.optionType === "CE" ? "🟢" : "🔴";
  const expiry = fmtExpiry(c.expiry);

  return [
    "📢 <b>TradeShala Alert</b>",
    "",
    `${head} <b>BUY ${kind}</b>`,
    `<b>${esc(c.symbol)} ${c.strike} ${c.optionType}</b>${expiry ? ` (${expiry})` : ""}`,
    `LTP: <b>₹${fmtPrice(c.ltp)}</b>`,
  ].join("\n");
}

/**
 * Build the HTML alert text for a processed signal. Pure (no I/O) so it's unit-
 * testable. `actionLabel` is the original BUY/SELL when the payload was broker-
 * style, else the entry side / "EXIT".
 */
export function buildAlertText(
  payload: WebhookPayload,
  applied: ApplyResult,
  actionLabel: string,
  contract?: OptionContractInfo
): string {
  // When the engine resolved a concrete option contract for an entry, show the
  // trader exactly what to buy (side + strike + LTP). Falls through to the plain
  // message for exits, or when no contract was resolved (engine off / mock / fail).
  if (contract && (applied.handled === "opened" || applied.handled === "reversed")) {
    return buildEntryText(payload, applied, contract);
  }

  const bullish = actionLabel === "BUY" || (payload.event === "entry" && payload.side === "long");
  const emoji = applied.handled === "reversed" ? "🔄" : bullish ? "🟢" : "🔴";

  const handledLine =
    applied.handled === "reversed"
      ? `Result: <b>reversed</b>${applied.detail ? ` (${esc(applied.detail)})` : ""}`
      : applied.handled === "closed"
        ? `Result: <b>closed</b>${applied.reason ? ` (${esc(applied.reason)})` : ""}`
        : `Result: <b>opened</b>`;

  return [
    "📢 <b>TradeShala Alert</b>",
    "",
    `${emoji} <b>${esc(actionLabel)}</b> · ${esc(payload.symbol)}`,
    `Price: <b>${fmtPrice(payload.price)}</b>`,
    `Strategy: ${esc(payload.strategy)}`,
    handledLine,
  ].join("\n");
}

export interface NotifyResult {
  sent: boolean;
  detail: string;
}

/** POST a message to the configured Telegram chat. Never throws. */
export async function sendTelegramAlert(text: string): Promise<NotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return { sent: false, detail: "telegram not configured" };

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, detail: `telegram HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { sent: true, detail: "sent" };
  } catch (e) {
    return { sent: false, detail: `telegram error: ${(e as Error).message}` };
  }
}
