import { describe, it, expect } from "vitest";
import { buildAlertText } from "./notify";
import type { WebhookPayload } from "./schema";
import type { ApplyResult } from "./processor";
import type { OptionContractInfo } from "@/services/trade-engine.server";

const entry = (side: "long" | "short"): WebhookPayload =>
  ({ event: "entry", strategy: "TriSeq_Bullish", symbol: "NIFTY", side, price: 24455.95, qty: 1 }) as WebhookPayload;

const contract = (over: Partial<OptionContractInfo> = {}): OptionContractInfo => ({
  symbol: "NIFTY",
  optionType: "CE",
  strike: 24500,
  expiry: "2026-09-05",
  ltp: 120.5,
  fillPrice: 120.62,
  quantity: 300,
  lots: 4,
  target: 140.5,
  stopLoss: 110.5,
  strikeNote: "~0.6Δ",
  source: "upstox",
  ...over,
});

describe("buildAlertText", () => {
  it("formats a BUY open with the bullish marker and price", () => {
    const txt = buildAlertText(entry("long"), { handled: "opened" } as ApplyResult, "BUY");
    expect(txt).toContain("📢 <b>TradeShala Alert</b>");
    expect(txt).toContain("🟢 <b>BUY</b> · NIFTY");
    expect(txt).toContain("Price: <b>24,455.95</b>");
    expect(txt).toContain("Strategy: TriSeq_Bullish");
    expect(txt).toContain("Result: <b>opened</b>");
  });

  it("uses the reverse marker and detail for a flip", () => {
    const txt = buildAlertText(
      entry("short"),
      { handled: "reversed", detail: "closed long then opened short" } as ApplyResult,
      "SELL"
    );
    expect(txt).toContain("🔄 <b>SELL</b> · NIFTY");
    expect(txt).toContain("Result: <b>reversed</b> (closed long then opened short)");
  });

  it("shows the exit reason on a close", () => {
    const exit = { event: "exit", strategy: "S", symbol: "NIFTY", price: 24070.5 } as WebhookPayload;
    const txt = buildAlertText(exit, { handled: "closed", reason: "tp" } as ApplyResult, "EXIT");
    expect(txt).toContain("🔴 <b>EXIT</b> · NIFTY");
    expect(txt).toContain("Result: <b>closed</b> (tp)");
  });

  it("shows only side + strike/expiry + LTP for a CALL entry", () => {
    const txt = buildAlertText(entry("long"), { handled: "opened" } as ApplyResult, "BUY", contract());
    expect(txt).toContain("🟢 <b>BUY CALL</b>");
    expect(txt).toMatch(/<b>NIFTY 24500 CE<\/b> \(05 Sept?\)/); // ICU may abbreviate Sep/Sept
    expect(txt).toContain("LTP: <b>₹120.5</b>");
    // The removed fields must not appear.
    expect(txt).not.toContain("lot");
    expect(txt).not.toContain("Target");
    expect(txt).not.toContain("SL");
    expect(txt).not.toContain("Index");
    expect(txt).not.toContain("Strategy");
    expect(txt).not.toContain("Result");
  });

  it("shows a PUT entry with the bearish marker and PE contract", () => {
    const txt = buildAlertText(
      entry("short"),
      { handled: "opened" } as ApplyResult,
      "SELL",
      contract({ optionType: "PE", strike: 24400 })
    );
    expect(txt).toContain("🔴 <b>BUY PUT</b>");
    expect(txt).toContain("<b>NIFTY 24400 PE</b>");
  });

  it("marks a reversal entry with the flip emoji but still shows the contract", () => {
    const txt = buildAlertText(
      entry("short"),
      { handled: "reversed", detail: "closed CE then opened PE" } as ApplyResult,
      "SELL",
      contract({ optionType: "PE", strike: 24400 })
    );
    expect(txt).toContain("🔄 <b>BUY PUT</b>");
    expect(txt).toContain("<b>NIFTY 24400 PE</b>");
  });

  it("falls back to the plain message when no contract is resolved", () => {
    const txt = buildAlertText(entry("long"), { handled: "opened" } as ApplyResult, "BUY");
    expect(txt).toContain("🟢 <b>BUY</b> · NIFTY");
    expect(txt).not.toContain("BUY CALL");
  });

  it("HTML-escapes strategy/symbol so parse_mode=HTML can't break", () => {
    const p = { ...entry("long"), strategy: "A<b>&x", symbol: "N&<>" } as WebhookPayload;
    const txt = buildAlertText(p, { handled: "opened" } as ApplyResult, "BUY");
    expect(txt).toContain("Strategy: A&lt;b&gt;&amp;x");
    expect(txt).toContain("· N&amp;&lt;&gt;");
    expect(txt).not.toMatch(/Strategy: A<b>/);
  });
});
