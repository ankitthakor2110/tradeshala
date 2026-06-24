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
