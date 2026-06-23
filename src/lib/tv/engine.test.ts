import { describe, it, expect } from "vitest";
import {
  secretsMatch,
  dedupeKey,
  computePnl,
  inferExitReason,
  reasonTolerance,
  decideEntry,
  ipAllowed,
} from "./engine";
import { validateWebhook } from "./schema";

// ---------------------------------------------------------------------------
// Auth — constant-time secret comparison
// ---------------------------------------------------------------------------
describe("secretsMatch (auth)", () => {
  it("accepts an exact match", () => {
    expect(secretsMatch("s3cr3t", "s3cr3t")).toBe(true);
  });
  it("rejects a mismatch", () => {
    expect(secretsMatch("wrong", "s3cr3t")).toBe(false);
  });
  it("rejects when lengths differ (no length-based throw)", () => {
    expect(secretsMatch("short", "a-much-longer-secret-value")).toBe(false);
  });
  it("rejects empty / missing provided secret", () => {
    expect(secretsMatch("", "s3cr3t")).toBe(false);
    expect(secretsMatch(null, "s3cr3t")).toBe(false);
    expect(secretsMatch(undefined, "s3cr3t")).toBe(false);
  });
  it("rejects when the server secret is unset", () => {
    expect(secretsMatch("anything", "")).toBe(false);
    expect(secretsMatch("anything", undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Schema validation (drives 422 responses)
// ---------------------------------------------------------------------------
describe("validateWebhook (schema / 422)", () => {
  const entry = {
    secret: "x",
    event: "entry",
    strategy: "VWAP-MR",
    side: "long",
    option_type: "CALL",
    symbol: "NIFTY",
    timeframe: "5",
    price: 24050.5,
    sl: 24040.5,
    tp: 24070.5,
    qty: 1,
    time: "2026-06-23T10:15:00Z",
  };

  it("accepts a well-formed ENTRY", () => {
    const r = validateWebhook(entry);
    expect(r.ok).toBe(true);
    if (r.ok && r.payload.event === "entry") {
      expect(r.payload.side).toBe("long");
      expect(r.payload.qty).toBe(1);
    }
  });

  it("accepts a well-formed EXIT", () => {
    const r = validateWebhook({
      secret: "x",
      event: "exit",
      strategy: "VWAP-MR",
      symbol: "NIFTY",
      price: 24070.5,
      time: "2026-06-23T10:40:00Z",
    });
    expect(r.ok).toBe(true);
  });

  it("defaults qty to 1 when omitted", () => {
    const noQty: Record<string, unknown> = { ...entry };
    delete noQty.qty;
    const r = validateWebhook(noQty);
    expect(r.ok).toBe(true);
    if (r.ok && r.payload.event === "entry") expect(r.payload.qty).toBe(1);
  });

  it("coerces a numeric timeframe to string", () => {
    const r = validateWebhook({ ...entry, timeframe: 15 });
    expect(r.ok).toBe(true);
    if (r.ok && r.payload.event === "entry") expect(r.payload.timeframe).toBe("15");
  });

  it("rejects a bad side enum and names the field", () => {
    const r = validateWebhook({ ...entry, side: "up" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("side");
  });

  it("rejects a bad event", () => {
    const r = validateWebhook({ ...entry, event: "buy" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("event");
  });

  it("rejects a non-numeric price", () => {
    const r = validateWebhook({ ...entry, price: "24050" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("price");
  });

  it("rejects a missing strategy", () => {
    const noStrat: Record<string, unknown> = { ...entry };
    delete noStrat.strategy;
    const r = validateWebhook(noStrat);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("strategy");
  });

  it("rejects a negative price", () => {
    const r = validateWebhook({ ...entry, price: -1 });
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P&L math (entry -> exit, including round-trip costs)
// ---------------------------------------------------------------------------
describe("computePnl (points x lot - costs)", () => {
  const cfg = { qty: 1, pointValue: 65, costPerOrder: 35 };

  it("long winner: (exit-entry) * qty * pointValue - 2*cost", () => {
    const r = computePnl({ side: "long", entry: 24050.5, exit: 24070.5, ...cfg });
    // move 20 -> gross 1300, cost 70, net 1230
    expect(r.gross).toBe(1300);
    expect(r.cost).toBe(70);
    expect(r.net).toBe(1230);
  });

  it("long loser nets negative", () => {
    const r = computePnl({ side: "long", entry: 24070.5, exit: 24050.5, ...cfg });
    expect(r.gross).toBe(-1300);
    expect(r.net).toBe(-1370);
  });

  it("short winner: profits when price falls", () => {
    const r = computePnl({ side: "short", entry: 24070.5, exit: 24050.5, ...cfg });
    expect(r.gross).toBe(1300);
    expect(r.net).toBe(1230);
  });

  it("short loser: loses when price rises", () => {
    const r = computePnl({ side: "short", entry: 24050.5, exit: 24070.5, ...cfg });
    expect(r.gross).toBe(-1300);
    expect(r.net).toBe(-1370);
  });

  it("scales with qty (lots)", () => {
    const r = computePnl({ side: "long", entry: 100, exit: 110, qty: 3, pointValue: 65, costPerOrder: 35 });
    // move 10 * 3 * 65 = 1950, cost 70, net 1880
    expect(r.gross).toBe(1950);
    expect(r.net).toBe(1880);
  });
});

// ---------------------------------------------------------------------------
// Exit-reason inference
// ---------------------------------------------------------------------------
describe("inferExitReason", () => {
  const tol = reasonTolerance(24070, 0.001, 0.05); // ~24.07

  it("classifies a fill near tp as tp", () => {
    expect(inferExitReason(24070.5, 24040.5, 24070.5, tol)).toBe("tp");
  });
  it("classifies a fill near sl as sl", () => {
    expect(inferExitReason(24040.5, 24040.5, 24070.5, tol)).toBe("sl");
  });
  it("classifies an in-between fill as manual", () => {
    expect(inferExitReason(24055, 24040.5, 24070.5, 0.5)).toBe("manual");
  });
  it("never matches a null sl/tp", () => {
    expect(inferExitReason(24070.5, null, null, tol)).toBe("manual");
  });
  it("prefers tp on a tie (tp checked first)", () => {
    expect(inferExitReason(100, 100, 100, 1)).toBe("tp");
  });
});

// ---------------------------------------------------------------------------
// Entry decisions (pyramiding / reverse)
// ---------------------------------------------------------------------------
describe("decideEntry", () => {
  it("opens when no position exists", () => {
    expect(decideEntry(null, "long", false).action).toBe("open");
  });
  it("ignores a same-direction signal (no pyramiding)", () => {
    const d = decideEntry("long", "long", true);
    expect(d.action).toBe("ignore");
  });
  it("reverses an opposite position when ALLOW_REVERSE is on", () => {
    expect(decideEntry("long", "short", true).action).toBe("reverse_then_open");
  });
  it("ignores an opposite signal when ALLOW_REVERSE is off", () => {
    expect(decideEntry("long", "short", false).action).toBe("ignore");
  });
});

// ---------------------------------------------------------------------------
// Dedupe key
// ---------------------------------------------------------------------------
describe("dedupeKey", () => {
  const base = { strategy: "VWAP-MR", event: "entry", symbol: "NIFTY", price: 24050.5, time: "t1" };

  it("uses the payload id when present", () => {
    expect(dedupeKey({ ...base, id: "abc" })).toBe("id:abc");
    expect(dedupeKey({ ...base, id: 123 })).toBe("id:123");
  });
  it("falls back to a stable hash of strategy+event+symbol+price+time", () => {
    const a = dedupeKey(base);
    const b = dedupeKey({ ...base });
    expect(a).toBe(b);
    expect(a.startsWith("h:")).toBe(true);
  });
  it("produces different keys for different signals", () => {
    expect(dedupeKey(base)).not.toBe(dedupeKey({ ...base, price: 24051 }));
    expect(dedupeKey(base)).not.toBe(dedupeKey({ ...base, event: "exit" }));
  });
});

// ---------------------------------------------------------------------------
// IP allowlist
// ---------------------------------------------------------------------------
describe("ipAllowed", () => {
  it("allows all when the allowlist is empty (OFF)", () => {
    expect(ipAllowed([], "1.2.3.4")).toBe(true);
    expect(ipAllowed([], null)).toBe(true);
  });
  it("allows a listed IP", () => {
    expect(ipAllowed(["52.89.214.238"], "52.89.214.238")).toBe(true);
  });
  it("matches any hop in x-forwarded-for", () => {
    expect(ipAllowed(["52.89.214.238"], "52.89.214.238, 10.0.0.1")).toBe(true);
  });
  it("rejects an unlisted IP", () => {
    expect(ipAllowed(["52.89.214.238"], "9.9.9.9")).toBe(false);
    expect(ipAllowed(["52.89.214.238"], null)).toBe(false);
  });
});
