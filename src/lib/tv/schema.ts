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
// This maps such a payload into the canonical fields BEFORE validation:
//   - ticker            -> symbol   (only if symbol is absent)
//   - price/sl/tp/qty    : numeric strings -> numbers
//   - time (epoch s/ms)  -> ISO-8601 string
//   - action BUY|SELL    -> event:"entry" + side:"long"|"short"  (flip model)
// A payload already in canonical form (has `event`) passes through untouched
// except for the numeric/time coercions. Unknown keys (exchange, action, ticker)
// are left in place; the zod object schemas strip them.

/** BUY / SELL -> an always-in-market entry (flip: opposite signal reverses). */
const ACTION_TO_SIGNAL: Record<string, { event: "entry"; side: "long" | "short" }> = {
  BUY: { event: "entry", side: "long" },
  SELL: { event: "entry", side: "short" },
};

/** True when the raw payload used broker-style `action` instead of `event`. */
export function isActionPayload(raw: Record<string, unknown> | null | undefined): boolean {
  return !!raw && typeof raw.action === "string" && raw.event == null;
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

  for (const k of ["price", "sl", "tp", "qty"] as const) {
    if (out[k] != null) out[k] = coerceNumber(out[k]);
  }
  if (out.time != null) out.time = coerceTime(out.time);

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
