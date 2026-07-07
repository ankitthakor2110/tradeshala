import { z } from "zod";

// Strict validation of TradingView alert payloads. Bodies arrive as text/plain
// or application/json; the route always JSON-parses the raw string first, then
// validates here. Unknown fields are allowed (TradingView templates vary), but
// types and enums are strict — a bad enum/type fails with a 422 naming the field.

// TradingView sends timeframe as "5" or 5; accept either, store as string.
const timeframe = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .nullable()
  .optional();

// Dedupe id may be a string or number.
const idField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .nullable()
  .optional();

const finiteNumber = z.number().finite();
const positivePrice = finiteNumber.positive();

const base = {
  // `secret` is accepted in the body as a fallback to the ?secret= query param.
  // It's validated for auth in the route and not used by the engine.
  secret: z.string().optional(),
  strategy: z.string().min(1, "strategy is required"),
  symbol: z.string().min(1, "symbol is required"),
  time: z.string().min(1).nullable().optional(),
  id: idField,
};

export const entrySchema = z.object({
  ...base,
  event: z.literal("entry"),
  side: z.enum(["long", "short"]),
  option_type: z.enum(["CALL", "PUT"]).nullable().optional(),
  timeframe,
  price: positivePrice,
  sl: finiteNumber.nullable().optional(),
  tp: finiteNumber.nullable().optional(),
  qty: z.number().positive().default(1),
});

export const exitSchema = z.object({
  ...base,
  event: z.literal("exit"),
  price: positivePrice,
});

export const webhookSchema = z.discriminatedUnion("event", [entrySchema, exitSchema]);

export type EntryPayload = z.infer<typeof entrySchema>;
export type ExitPayload = z.infer<typeof exitSchema>;
export type WebhookPayload = z.infer<typeof webhookSchema>;

export type ValidationResult =
  | { ok: true; payload: WebhookPayload }
  | { ok: false; message: string };

// ---------------------------------------------------------------------------
// Inbound normalization (raw TradingView alert -> canonical webhook shape)
// ---------------------------------------------------------------------------
//
// TradingView strategy alerts can send a broker-style payload that doesn't match
// the canonical shape above, e.g.:
//   {"ticker":"NIFTY","exchange":"NSE","action":"BUY","price":"24455.95",
//    "time":"1783325160000","strategy":"TriSeq_Bullish"}
// ...or an option-scalper dialect that names its fields differently, e.g.:
//   {"symbol":"NIFTY","side":"BUY_PE","entry":24377.45,"sl":...,"target":...,
//    "strategy_version":"nifty-scalper-1.0","signal_id":"...","trigger":"..."}
// This maps such a payload into the canonical fields BEFORE validation:
//   - ticker              -> symbol   (only if symbol is absent)
//   - entry|spot          -> price    (only if price is absent)
//   - target              -> tp       (only if tp is absent)
//   - strategy_version|trigger -> strategy (only if strategy is absent)
//   - signal_id           -> id       (dedupe key; only if id is absent)
//   - price/sl/tp/qty      : numeric strings -> numbers
//   - time (epoch s/ms)    -> ISO-8601 string
//   - action BUY|SELL      -> event:"entry" + side:"long"|"short"  (flip model)
//   - side BUY_CE|BUY_PE   -> event:"entry" + side:"long"|"short" + option_type
// A payload already in canonical form (has `event`) passes through untouched
// except for the numeric/time coercions. Unknown keys (exchange, action, ticker,
// strike, rr, ...) are left in place; the zod object schemas strip them.

/** BUY / SELL -> an always-in-market entry (flip: opposite signal reverses). */
const ACTION_TO_SIGNAL: Record<string, { event: "entry"; side: "long" | "short" }> = {
  BUY: { event: "entry", side: "long" },
  SELL: { event: "entry", side: "short" },
};

// Option-scalper buy-to-open: BUY_CE (call) is a bullish/long bet, BUY_PE (put)
// is bearish/short. We only ever buy-to-open, and the always-in-market flip
// closes the prior side on reversal. SELL_CE/SELL_PE are intentionally NOT
// mapped (their close semantics are unconfirmed) so they fail validation loudly.
const OPTION_ENTRY_RE = /^BUY_(CE|PE)$/i;

/**
 * True when the raw payload is a broker-style / always-in-market signal (uses
 * `action` or an option-scalper `side` like "BUY_PE" instead of `event`). The
 * route forces `allowReverse` for these so an opposite signal reverses.
 */
export function isActionPayload(raw: Record<string, unknown> | null | undefined): boolean {
  if (!raw || raw.event != null) return false;
  if (typeof raw.action === "string") return true;
  if (typeof raw.side === "string" && OPTION_ENTRY_RE.test(raw.side)) return true;
  return false;
}

function coerceNumber(v: unknown): unknown {
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return v;
}

/** Epoch seconds (10-digit) or milliseconds (13-digit) -> ISO string; ISO passes through. */
function coerceTime(v: unknown): unknown {
  if (v == null) return v;
  // A non-numeric string is assumed to already be an ISO/parseable timestamp.
  if (typeof v === "string" && !/^\d+$/.test(v.trim())) return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  const ms = n < 1e12 ? n * 1000 : n; // <1e12 => seconds
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

/** Map a raw parsed alert into the canonical webhook shape (pure, no I/O). */
export function normalizeInbound(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  if (out.symbol == null && out.ticker != null) out.symbol = out.ticker;

  // Option-scalper dialect: price/tp/strategy/id live under different keys.
  if (out.price == null && out.entry != null) out.price = out.entry;
  if (out.price == null && out.spot != null) out.price = out.spot;
  if (out.tp == null && out.target != null) out.tp = out.target;
  if ((out.strategy == null || out.strategy === "") && out.strategy_version != null)
    out.strategy = out.strategy_version;
  if ((out.strategy == null || out.strategy === "") && out.trigger != null)
    out.strategy = out.trigger;
  if (out.id == null && out.signal_id != null) out.id = out.signal_id;

  for (const k of ["price", "sl", "tp", "qty"] as const) {
    if (out[k] != null) out[k] = coerceNumber(out[k]);
  }
  if (out.time != null) out.time = coerceTime(out.time);

  // Option-scalper side ("BUY_CE" / "BUY_PE") -> canonical entry + option_type.
  if (out.event == null && typeof out.side === "string" && OPTION_ENTRY_RE.test(out.side)) {
    const isCall = /_CE$/i.test(out.side);
    out.event = "entry";
    out.side = isCall ? "long" : "short";
    if (out.option_type == null) out.option_type = isCall ? "CALL" : "PUT";
  }

  if (out.event == null && typeof out.action === "string") {
    const mapped = ACTION_TO_SIGNAL[out.action.trim().toUpperCase()];
    if (mapped) {
      out.event = mapped.event;
      if (out.side == null) out.side = mapped.side;
    }
  }

  return out;
}

/** Validate a parsed JSON object. Returns a 422-ready message naming the bad field. */
export function validateWebhook(input: unknown): ValidationResult {
  const parsed = webhookSchema.safeParse(input);
  if (parsed.success) return { ok: true, payload: parsed.data };

  const issue = parsed.error.issues[0];
  const path = issue?.path.join(".") || "(root)";
  // discriminatedUnion reports a helpful message when `event` is bad/missing.
  const message =
    issue?.path.length === 0 || issue?.path[0] === "event"
      ? `Invalid payload: 'event' must be "entry" or "exit" (${issue?.message ?? "unknown"})`
      : `Invalid field '${path}': ${issue?.message ?? "invalid"}`;
  return { ok: false, message };
}
