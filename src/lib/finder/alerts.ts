import type { ScreenerRow } from "@/types/finder";

// Pure logic for Trade Finder threshold alerts (no I/O, unit-tested). Decides
// which movers cross the alert threshold and which are off cooldown, and formats
// the Telegram message. The server route holds the (best-effort) cooldown state
// and does the actual send via src/lib/tv/notify.ts. `now` is injected so this
// stays deterministic and testable.

export interface FinderAlert {
  symbol: string;
  changePercent: number;
  ltp: number;
}

/** Rows whose absolute % move meets the threshold. Threshold ≤ 0 alerts nothing. */
export function alertCandidates(rows: ScreenerRow[], thresholdPct: number): FinderAlert[] {
  if (!(thresholdPct > 0)) return [];
  return rows
    .filter((r) => Math.abs(r.change_percent) >= thresholdPct)
    .map((r) => ({ symbol: r.symbol, changePercent: r.change_percent, ltp: r.last_price }));
}

/**
 * Drop candidates alerted within `cooldownMs`. Returns the subset to send and the
 * updated last-alerted map (timestamps for sent symbols bumped to `now`, all
 * prior entries preserved so unrelated symbols keep their cooldown).
 */
export function filterOnCooldown(
  candidates: FinderAlert[],
  lastAlerted: Record<string, number>,
  now: number,
  cooldownMs: number
): { send: FinderAlert[]; nextLastAlerted: Record<string, number> } {
  const next = { ...lastAlerted };
  const send: FinderAlert[] = [];
  for (const c of candidates) {
    const last = lastAlerted[c.symbol];
    if (last == null || now - last >= cooldownMs) {
      send.push(c);
      next[c.symbol] = now;
    }
  }
  return { send, nextLastAlerted: next };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : String(n);
}

/** HTML Telegram message for a batch of alerts (parse_mode=HTML). */
export function buildFinderAlertText(alerts: FinderAlert[]): string {
  const lines = alerts.map((a) => {
    const arrow = a.changePercent >= 0 ? "🟢" : "🔴";
    const sign = a.changePercent > 0 ? "+" : "";
    return `${arrow} <b>${esc(a.symbol)}</b> ${sign}${a.changePercent.toFixed(2)}% · ₹${fmt(a.ltp)}`;
  });
  return ["📈 <b>TradeShala · Trade Finder</b>", "Movers crossing your threshold:", "", ...lines].join("\n");
}
