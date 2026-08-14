// End-to-end smoke test for the TradingView paper-trading webhook.
// Fires a full ENTRY -> EXIT flow plus auth/validation/dedupe cases against a
// running server, WITHOUT needing TradingView. PAPER TRADING ONLY.
//
// ACK-FIRST CONTRACT (since the timeout fix): the route replies as soon as the
// in-memory auth gate passes, then runs the WHOLE pipeline (log -> validate ->
// dedupe -> ledger -> engine -> Telegram) in after(). So over HTTP:
//   - Authenticated requests ALWAYS return 200 { ok: true, accepted: true } —
//     valid, invalid, ignored, or duplicate alike.
//   - Only the auth gate returns non-200 (401 bad/missing secret or IP,
//     503 if WEBHOOK_SECRET is unset on the server).
// The real outcome (opened / ignored / duplicate / closed / REJECTED) is written
// to the tv_webhook_logs table and reflected on /dashboard/signals — it is NOT
// in the HTTP response. So this script can only assert the transport contract
// (accepted vs auth-rejected); check the log table / Signals page for semantics.
//
// NOTE: if TV_ENGINE_EXECUTION is on, each accepted ENTRY also places a REAL
// paper option order (0.60Δ strike, configured lots) in the trade account, and
// EXIT closes it. Running this against prod will leave paper positions/trades to
// clean up (Positions page, or auto-square-off).
//
// Usage:
//   npm run tv:test                       # uses WEBHOOK_SECRET from .env.local
//   node scripts/tv-webhook-test.mjs --url http://localhost:3000 --secret mysecret
//   node scripts/tv-webhook-test.mjs --url https://your-prod-domain --secret ...
//
// Flags: --url (default http://localhost:3000), --secret (default $WEBHOOK_SECRET),
//        --strategy (default DEMO-VWAP), --symbol (default NIFTY)

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg("url", "http://localhost:3000").replace(/\/$/, "");
const SECRET = arg("secret", process.env.WEBHOOK_SECRET || "");
const STRATEGY = arg("strategy", "DEMO-VWAP");
const SYMBOL = arg("symbol", "NIFTY");
const ENDPOINT = `${BASE}/api/webhook/tradingview`;

if (!SECRET) {
  console.error(
    "No secret. Pass --secret <value> or set WEBHOOK_SECRET (npm run tv:test loads .env.local)."
  );
  process.exit(1);
}

const urlWithSecret = `${ENDPOINT}?secret=${encodeURIComponent(SECRET)}`;

// Send a payload as text/plain (how TradingView sends it) to a given URL.
// expect = { status?, accepted? }: assert the HTTP status and, when accepted is
// true, that the body is the ack-first shape { ok: true, accepted: true }.
async function send(label, url, body, expect = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = await res.text();
  }

  const statusOk = expect.status == null || res.status === expect.status;
  const acceptedOk =
    !expect.accepted || (json && json.ok === true && json.accepted === true);
  const ok = statusOk && acceptedOk;

  const tag = ok ? "PASS" : "FAIL";
  const want = [
    expect.status != null ? `HTTP ${expect.status}` : null,
    expect.accepted ? "accepted:true" : null,
  ]
    .filter(Boolean)
    .join(", ");
  console.log(`[${tag}] ${label} -> HTTP ${res.status}${want ? ` (expected ${want})` : ""}`);
  console.log("        " + JSON.stringify(json));
  return { res, json, ok };
}

const now = () => new Date().toISOString();

async function main() {
  console.log(`Target: ${ENDPOINT}`);
  console.log(`Strategy: ${STRATEGY}  Symbol: ${SYMBOL}`);
  console.log(
    "Contract: authenticated -> 200 {accepted:true}; outcomes live in tv_webhook_logs / Signals page.\n"
  );

  const results = [];

  // 1) ENTRY (long) — accepted; opens a position (+ engine order if enabled).
  results.push(
    await send(
      "1. ENTRY long (open)",
      urlWithSecret,
      {
        event: "entry",
        strategy: STRATEGY,
        side: "long",
        option_type: "CALL",
        symbol: SYMBOL,
        timeframe: "5",
        price: 24050.5,
        sl: 24040.5,
        tp: 24070.5,
        qty: 1,
        time: now(),
      },
      { status: 200, accepted: true }
    )
  );

  // 2) Same-direction ENTRY (different price/time so it isn't deduped). Accepted
  //    at HTTP; processing IGNORES it (no pyramiding) — verify in the log/UI.
  results.push(
    await send(
      "2. ENTRY long again (accepted; processed as ignored — no pyramiding)",
      urlWithSecret,
      {
        event: "entry",
        strategy: STRATEGY,
        side: "long",
        symbol: SYMBOL,
        price: 24052.0,
        qty: 1,
        time: now(),
      },
      { status: 200, accepted: true }
    )
  );

  // 3) Duplicate of an identical signal within the dedupe window. Both accepted
  //    at HTTP; the second is dropped as a duplicate during processing.
  const dupBody = {
    event: "entry",
    strategy: STRATEGY,
    side: "long",
    symbol: SYMBOL,
    price: 24050.5,
    qty: 1,
    time: "2026-06-23T10:15:00Z",
    id: "dedupe-demo-1",
  };
  await send("3a. ENTRY with id (first)", urlWithSecret, dupBody, { status: 200, accepted: true });
  results.push(
    await send(
      "3b. same id again (accepted; processed as duplicate)",
      urlWithSecret,
      dupBody,
      { status: 200, accepted: true }
    )
  );

  // 4) EXIT at the TP price. Accepted at HTTP; processing closes the position
  //    (reason "tp"), and the engine SELLs the contract if execution is on.
  results.push(
    await send(
      "4. EXIT at TP (accepted; processed as close, reason tp)",
      urlWithSecret,
      {
        event: "exit",
        strategy: STRATEGY,
        symbol: SYMBOL,
        price: 24070.5,
        time: now(),
      },
      { status: 200, accepted: true }
    )
  );

  // 5) Bad secret -> 401 (auth is the only synchronous gate).
  results.push(
    await send(
      "5. Bad secret (auth)",
      `${ENDPOINT}?secret=wrong-secret`,
      { event: "exit", strategy: STRATEGY, symbol: SYMBOL, price: 24070.5 },
      { status: 401 }
    )
  );

  // 6) Invalid payload. Auth passes, so it's ACCEPTED at HTTP (200); the async
  //    pipeline then rejects it — visible as status "rejected" in tv_webhook_logs,
  //    NOT as an HTTP error. (Pre-ack-first this returned 422.)
  results.push(
    await send(
      "6. Invalid side enum (accepted at HTTP; rejected in tv_webhook_logs)",
      urlWithSecret,
      { event: "entry", strategy: STRATEGY, side: "up", symbol: SYMBOL, price: 24050.5 },
      { status: 200, accepted: true }
    )
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? "ALL OK" : `${failed} CHECK(S) FAILED`}`);
  console.log(
    "Verify actual outcomes (opened / ignored / duplicate / closed / rejected) in the\n" +
      "tv_webhook_logs table or on /dashboard/signals — they are not in the HTTP responses."
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Test run error (is the server running / URL reachable?):", e.message);
  process.exit(1);
});
