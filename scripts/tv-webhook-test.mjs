// End-to-end smoke test for the TradingView paper-trading webhook.
// Fires a full ENTRY -> EXIT flow plus auth/validation/dedupe cases against a
// running server, WITHOUT needing TradingView. PAPER TRADING ONLY.
//
// Usage:
//   npm run tv:test                       # uses WEBHOOK_SECRET from .env.local
//   node scripts/tv-webhook-test.mjs --url http://localhost:3000 --secret mysecret
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
async function send(label, url, body, expectStatus) {
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
  const ok = expectStatus == null || res.status === expectStatus;
  const tag = ok ? "PASS" : "FAIL";
  console.log(
    `[${tag}] ${label} -> HTTP ${res.status}${expectStatus ? ` (expected ${expectStatus})` : ""}`
  );
  console.log("        " + JSON.stringify(json));
  return { res, json, ok };
}

const now = () => new Date().toISOString();

async function main() {
  console.log(`Target: ${ENDPOINT}`);
  console.log(`Strategy: ${STRATEGY}  Symbol: ${SYMBOL}\n`);

  const results = [];

  // 1) ENTRY (long) — opens a position.
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
      200
    )
  );

  // 2) Same-direction ENTRY (different price/time so it isn't deduped) — should
  //    be IGNORED (no pyramiding).
  results.push(
    await send(
      "2. ENTRY long again (no pyramiding -> ignored)",
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
      200
    )
  );

  // 3) Duplicate of an identical signal within the dedupe window.
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
  await send("3a. ENTRY with id (first)", urlWithSecret, dupBody, 200);
  results.push(await send("3b. same id again (duplicate)", urlWithSecret, dupBody, 200));

  // 4) EXIT at the TP price — closes the position, reason "tp".
  results.push(
    await send(
      "4. EXIT at TP (close, reason tp)",
      urlWithSecret,
      {
        event: "exit",
        strategy: STRATEGY,
        symbol: SYMBOL,
        price: 24070.5,
        time: now(),
      },
      200
    )
  );

  // 5) Bad secret -> 401.
  results.push(
    await send(
      "5. Bad secret (auth)",
      `${ENDPOINT}?secret=wrong-secret`,
      { event: "exit", strategy: STRATEGY, symbol: SYMBOL, price: 24070.5 },
      401
    )
  );

  // 6) Invalid payload -> 422.
  results.push(
    await send(
      "6. Invalid side enum (validation)",
      urlWithSecret,
      { event: "entry", strategy: STRATEGY, side: "up", symbol: SYMBOL, price: 24050.5 },
      422
    )
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? "ALL OK" : `${failed} CHECK(S) FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Test run error (is the dev server running?):", e.message);
  process.exit(1);
});
