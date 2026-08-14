import { describe, it, expect } from "vitest";
import {
  normalizeInbound,
  isActionPayload,
  validateWebhook,
  repairLooseJson,
  parseLooseJson,
} from "./schema";

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

  // Option-scalper dialect — the exact payload received from the nifty-scalper bot.
  const rawScalperPe = {
    symbol: "NIFTY",
    side: "BUY_PE",
    option: "24450 PE",
    strike: 24450,
    spot: 24377.45,
    entry: 24377.45,
    sl: 24392.45,
    target: 24347.45,
    rr: "1:2",
    tf: "1",
    trigger: "ZL_TREND_FLIP",
    time: "2026-07-07T15:21",
    strategy_version: "nifty-scalper-1.0",
    signal_id: "00000000-0000-0000-0000-000000000000-1783417860000-BUY_PE",
  };

  it("maps a BUY_PE scalper payload to a valid short PUT entry", () => {
    const out = normalizeInbound(rawScalperPe);
    expect(out.event).toBe("entry");
    expect(out.side).toBe("short");
    expect(out.option_type).toBe("PUT");
    expect(out.price).toBe(24377.45); // from `entry`
    expect(out.tp).toBe(24347.45); // from `target`
    expect(out.sl).toBe(24392.45);
    expect(out.strategy).toBe("nifty-scalper-1.0"); // from `strategy_version`
    expect(out.id).toBe(rawScalperPe.signal_id); // from `signal_id` (dedupe)

    const result = validateWebhook(out);
    expect(result.ok).toBe(true);
    if (result.ok && result.payload.event === "entry") {
      expect(result.payload.side).toBe("short");
      expect(result.payload.option_type).toBe("PUT");
    }
  });

  it("maps BUY_CE to a long CALL entry", () => {
    const out = normalizeInbound({ ...rawScalperPe, side: "BUY_CE" });
    expect(out.side).toBe("long");
    expect(out.option_type).toBe("CALL");
    expect(validateWebhook(out).ok).toBe(true);
  });

  it("falls back to spot for price and trigger for strategy", () => {
    const { entry: _entry, strategy_version: _sv, ...noEntry } = rawScalperPe;
    void _entry;
    void _sv;
    const out = normalizeInbound(noEntry);
    expect(out.price).toBe(24377.45); // from `spot`
    expect(out.strategy).toBe("ZL_TREND_FLIP"); // from `trigger`
    expect(validateWebhook(out).ok).toBe(true);
  });

  it("does not map SELL_PE/SELL_CE (unconfirmed close semantics)", () => {
    const out = normalizeInbound({ ...rawScalperPe, side: "SELL_PE" });
    expect(out.event).toBeUndefined();
    expect(validateWebhook(out).ok).toBe(false);
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
  it("detects option-scalper BUY_CE/BUY_PE side payloads", () => {
    expect(isActionPayload({ side: "BUY_PE" })).toBe(true);
    expect(isActionPayload({ side: "BUY_CE" })).toBe(true);
  });
  it("does not treat SELL_PE or a canonical side as an action payload", () => {
    expect(isActionPayload({ side: "SELL_PE" })).toBe(false);
    expect(isActionPayload({ side: "long", event: "entry" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lenient JSON parse — repair the leading-dot-decimal alert-message typo
// ---------------------------------------------------------------------------
describe("repairLooseJson", () => {
  it("adds the missing leading zero after a colon", () => {
    expect(repairLooseJson(`{"delta":.60}`)).toBe(`{"delta":0.60}`);
  });
  it("repairs negative and array/comma-position leading dots", () => {
    expect(repairLooseJson(`{"a":-.5,"b":.25,"c":[.1,.2]}`)).toBe(
      `{"a":-0.5,"b":0.25,"c":[0.1,0.2]}`
    );
  });
  it("tolerates whitespace between the separator and the dot", () => {
    expect(repairLooseJson(`{"x": .5}`)).toBe(`{"x": 0.5}`);
  });
  it("leaves well-formed numbers and dotted strings untouched", () => {
    const ok = `{"a":0.6,"b":"v1.0","id":"foo.60","t":1786689540000}`;
    expect(repairLooseJson(ok)).toBe(ok);
  });
});

describe("parseLooseJson", () => {
  // The exact ENTRY body from production that was being rejected: `"delta":.60`.
  const badEntry = `{"event":"entry","seq":2,"strategy":"Confluence-Scalper-v2","symbol":"NIFTY","side":"long","option_type":"CALL","timeframe":"3","price":24341.5,"sl":24331.5,"tp":24351.5,"sl_points":10,"tp_points":10,"delta":.60,"lots":2,"qty":1,"time":1786689540000,"id":"Confluence-Scalper-v2-CE-1786689540000"}`;

  it("recovers a payload that fails strict JSON due to a leading-dot decimal", () => {
    const parsed = parseLooseJson(badEntry);
    expect(parsed).not.toBeNull();
    expect(parsed!.event).toBe("entry");
    expect(parsed!.delta).toBe(0.6);
    // ...and the repaired object validates as a real entry signal.
    const result = validateWebhook(normalizeInbound(parsed!));
    expect(result.ok).toBe(true);
  });

  it("parses well-formed JSON without altering it", () => {
    const parsed = parseLooseJson(`{"event":"exit","strategy":"S","symbol":"NIFTY","price":24351.5}`);
    expect(parsed).toEqual({ event: "exit", strategy: "S", symbol: "NIFTY", price: 24351.5 });
  });

  it("returns null for genuinely unparseable bodies and non-objects", () => {
    expect(parseLooseJson("not json at all")).toBeNull();
    expect(parseLooseJson("[1,2,3]")).toBeNull(); // array is not an object payload
    expect(parseLooseJson("42")).toBeNull();
  });
});
