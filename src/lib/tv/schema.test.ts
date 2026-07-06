import { describe, it, expect } from "vitest";
import { normalizeInbound, isActionPayload, validateWebhook } from "./schema";

// ---------------------------------------------------------------------------
// normalizeInbound — broker-style TradingView alert -> canonical webhook shape
// ---------------------------------------------------------------------------
describe("normalizeInbound", () => {
  // The exact payload the integration receives from TradingView.
  const rawBuy = {
    ticker: "NIFTY",
    exchange: "NSE",
    action: "BUY",
    price: "24455.95",
    time: "1783325160000",
    strategy: "TriSeq_Bullish",
  };

  it("maps a BUY action payload to a valid long entry", () => {
    const out = normalizeInbound(rawBuy);
    expect(out.symbol).toBe("NIFTY");
    expect(out.event).toBe("entry");
    expect(out.side).toBe("long");
    expect(out.price).toBe(24455.95);
    expect(typeof out.price).toBe("number");
    // 1783325160000 ms epoch -> ISO
    expect(out.time).toBe(new Date(1783325160000).toISOString());

    const result = validateWebhook(out);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.event).toBe("entry");
      if (result.payload.event === "entry") expect(result.payload.side).toBe("long");
    }
  });

  it("maps SELL to a short entry", () => {
    const out = normalizeInbound({ ...rawBuy, action: "SELL" });
    expect(out.event).toBe("entry");
    expect(out.side).toBe("short");
    expect(validateWebhook(out).ok).toBe(true);
  });

  it("is case-insensitive on action", () => {
    expect(normalizeInbound({ ...rawBuy, action: "buy" }).side).toBe("long");
    expect(normalizeInbound({ ...rawBuy, action: "sell" }).side).toBe("short");
  });

  it("leaves an unknown action unmapped (validation then fails)", () => {
    const out = normalizeInbound({ ...rawBuy, action: "HOLD" });
    expect(out.event).toBeUndefined();
    expect(validateWebhook(out).ok).toBe(false);
  });

  it("prefers ticker only when symbol is absent", () => {
    expect(normalizeInbound({ ...rawBuy, symbol: "BANKNIFTY" }).symbol).toBe("BANKNIFTY");
  });

  it("converts 10-digit epoch seconds to ISO", () => {
    const out = normalizeInbound({ ...rawBuy, time: "1783325160" });
    expect(out.time).toBe(new Date(1783325160000).toISOString());
  });

  it("passes through an ISO time string untouched", () => {
    const iso = "2026-07-04T09:26:00.000Z";
    expect(normalizeInbound({ ...rawBuy, time: iso }).time).toBe(iso);
  });

  it("coerces numeric sl/tp/qty strings", () => {
    const out = normalizeInbound({ ...rawBuy, sl: "24400", tp: "24600.5", qty: "2" });
    expect(out.sl).toBe(24400);
    expect(out.tp).toBe(24600.5);
    expect(out.qty).toBe(2);
  });

  it("leaves a canonical entry payload valid (only coercions applied)", () => {
    const canonical = {
      event: "entry",
      strategy: "S",
      symbol: "NIFTY",
      side: "long",
      price: 100,
    };
    const out = normalizeInbound(canonical);
    expect(out.event).toBe("entry");
    expect(out.side).toBe("long");
    expect(validateWebhook(out).ok).toBe(true);
  });

  it("does not overwrite an explicit event with an action mapping", () => {
    const out = normalizeInbound({ event: "exit", action: "BUY", strategy: "S", symbol: "NIFTY", price: 100 });
    expect(out.event).toBe("exit");
  });
});

describe("isActionPayload", () => {
  it("detects broker-style action payloads", () => {
    expect(isActionPayload({ action: "BUY", price: 1 })).toBe(true);
  });
  it("is false when event is present", () => {
    expect(isActionPayload({ action: "BUY", event: "entry" })).toBe(false);
  });
  it("is false for canonical payloads and null", () => {
    expect(isActionPayload({ event: "entry" })).toBe(false);
    expect(isActionPayload(null)).toBe(false);
  });
});
