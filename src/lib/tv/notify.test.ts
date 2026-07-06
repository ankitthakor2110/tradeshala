import { describe, it, expect } from "vitest";
import { buildAlertText } from "./notify";
import type { WebhookPayload } from "./schema";
import type { ApplyResult } from "./processor";

const entry = (side: "long" | "short"): WebhookPayload =>
  ({ event: "entry", strategy: "TriSeq_Bullish", symbol: "NIFTY", side, price: 24455.95, qty: 1 }) as WebhookPayload;

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

  it("HTML-escapes strategy/symbol so parse_mode=HTML can't break", () => {
    const p = { ...entry("long"), strategy: "A<b>&x", symbol: "N&<>" } as WebhookPayload;
    const txt = buildAlertText(p, { handled: "opened" } as ApplyResult, "BUY");
    expect(txt).toContain("Strategy: A&lt;b&gt;&amp;x");
    expect(txt).toContain("· N&amp;&lt;&gt;");
    expect(txt).not.toMatch(/Strategy: A<b>/);
  });
});
