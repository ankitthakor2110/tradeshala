// ============================================================================
// Upstox Market Data Feed → live_quotes (WebSocket streaming worker)
// ----------------------------------------------------------------------------
// A standalone, always-on Node process (NOT part of the Next app — Vercel
// serverless can't hold a socket). It opens Upstox's V3 market-data WebSocket,
// subscribes to the index universe, decodes the protobuf feed, and upserts LTPs
// into the shared `live_quotes` table via the Supabase service role. Your
// existing Supabase Realtime fan-out (useLiveQuotes) pushes those to every tab —
// so there is NO per-client REST polling.
//
//   Run:  npm run ws:upstox      (loads .env.local, Node >= 20.6 for --env-file)
//
// Token: prefers the fresh DB token (broker_connections, set by the daily
// Upstox reconnect), falling back to UPSTOX_ACCESS_TOKEN from env.
//
// "For now" this streams the indices; later, per-user broker connections can
// reuse the same upsert path.
// ============================================================================

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import crypto from "node:crypto";
import WebSocket from "ws";
import protobuf from "protobufjs";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENC_KEY = process.env.BROKER_ENCRYPTION_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[ws] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Instrument key → the display symbol that live_quotes (and the UI) key on.
const INSTRUMENTS = [
  { key: "NSE_INDEX|Nifty 50", symbol: "NIFTY 50", exchange: "NSE" },
  { key: "NSE_INDEX|Nifty Bank", symbol: "BANK NIFTY", exchange: "NSE" },
  { key: "NSE_INDEX|Nifty Fin Service", symbol: "FINNIFTY", exchange: "NSE" },
  { key: "BSE_INDEX|SENSEX", symbol: "SENSEX", exchange: "BSE" },
];
const SYMBOL_BY_KEY = new Map(INSTRUMENTS.map((i) => [i.key, i]));

// --- secret decryption (mirrors src/lib/crypto/secrets.ts AES-256-GCM) ---
function decryptSecret(stored) {
  if (!stored || !stored.startsWith("enc:v1:")) return stored ?? null;
  if (!ENC_KEY) return null;
  const [ivB64, tagB64, ctB64] = stored.slice("enc:v1:".length).split(":");
  const key = crypto.createHash("sha256").update(ENC_KEY).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

async function getAccessToken() {
  const { data } = await supabase
    .from("broker_connections")
    .select("access_token, token_expiry")
    .eq("broker_id", "upstox")
    .eq("is_connected", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.access_token) {
    const valid = !data.token_expiry || new Date(data.token_expiry).getTime() > Date.now();
    const token = valid ? decryptSecret(data.access_token) : null;
    if (token) return token;
  }
  const env = process.env.UPSTOX_ACCESS_TOKEN;
  return env && !env.startsWith("your_") ? env : null;
}

// V3 authorize → returns the wss URL to connect to.
async function getFeedUrl(token) {
  const res = await fetch("https://api.upstox.com/v3/feed/market-data-feed/authorize", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`authorize failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const uri = json?.data?.authorizedRedirectUri ?? json?.data?.authorized_redirect_uri;
  if (!uri) throw new Error(`no feed URI in authorize response: ${JSON.stringify(json)}`);
  return uri;
}

// Pull LTPC out of whichever feed shape Upstox sent.
function extractLtpc(feed) {
  if (!feed) return null;
  return (
    feed.ltpc ??
    feed.fullFeed?.indexFF?.ltpc ??
    feed.fullFeed?.marketFF?.ltpc ??
    feed.firstLevelWithGreeks?.ltpc ??
    null
  );
}

// --- throttled writer: keep the latest tick per symbol, flush on an interval ---
const pending = new Map();
let flushing = false;
const FLUSH_MS = 1000;

async function flush() {
  if (flushing || pending.size === 0) return;
  flushing = true;
  const rows = [...pending.values()];
  pending.clear();
  try {
    const { error } = await supabase.from("live_quotes").upsert(rows, { onConflict: "symbol" });
    if (error) console.error("[ws] upsert error:", error.message);
    else console.log(`[ws] wrote ${rows.length} quote(s):`, rows.map((r) => `${r.symbol} ${r.ltp}`).join(", "));
  } catch (e) {
    console.error("[ws] flush failed:", e.message);
  } finally {
    flushing = false;
  }
}
setInterval(flush, FLUSH_MS);

// --- option streaming: dynamic subscription driven by the registry table ---
// The trade page upserts the contracts it's viewing into
// live_option_subscriptions; we stream the active set (requested recently) and
// drop the rest. optionMeta maps a live key → its quote metadata.
const optionMeta = new Map(); // instrument_key -> { symbol, expiry, strike, option_type }
const optionPending = new Map(); // instrument_key -> row to upsert
let optionFlushing = false;
let subscribedOptionKeys = new Set();
let currentWs = null;

const SUB_POLL_MS = 3000; // how often we reconcile the desired option set
const SUB_TTL_MS = 120_000; // a registry row is "active" if requested this recently
                            // (generous so a backgrounded tab — whose heartbeat
                            // is throttled by the browser — doesn't get dropped)
const MAX_OPTION_SUBS = 100; // hard cap on streamed contracts

async function flushOptions() {
  if (optionFlushing || optionPending.size === 0) return;
  optionFlushing = true;
  const rows = [...optionPending.values()];
  optionPending.clear();
  try {
    const { error } = await supabase
      .from("live_quotes")
      .upsert(rows, { onConflict: "symbol" });
    if (error) console.error("[ws] option upsert error:", error.message);
  } catch (e) {
    console.error("[ws] option flush failed:", e.message);
  } finally {
    optionFlushing = false;
  }
}
setInterval(flushOptions, FLUSH_MS);

async function reconcileOptionSubs() {
  if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;
  const since = new Date(Date.now() - SUB_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("live_option_subscriptions")
    .select("instrument_key, symbol, expiry, strike, option_type")
    .gte("requested_at", since)
    .order("requested_at", { ascending: false })
    .limit(MAX_OPTION_SUBS);
  if (error) {
    console.error("[ws] subscription read error:", error.message);
    return;
  }

  const desired = new Set();
  optionMeta.clear();
  for (const r of data ?? []) {
    desired.add(r.instrument_key);
    optionMeta.set(r.instrument_key, {
      symbol: r.symbol,
      expiry: r.expiry,
      strike: r.strike,
      option_type: r.option_type,
    });
  }

  const toAdd = [...desired].filter((k) => !subscribedOptionKeys.has(k));
  const toRemove = [...subscribedOptionKeys].filter((k) => !desired.has(k));

  if (toAdd.length) {
    currentWs.send(
      Buffer.from(
        JSON.stringify({
          guid: crypto.randomUUID(),
          method: "sub",
          data: { mode: "ltpc", instrumentKeys: toAdd },
        })
      )
    );
    console.log(`[ws] +sub ${toAdd.length} option(s)`);
  }
  if (toRemove.length) {
    currentWs.send(
      Buffer.from(
        JSON.stringify({
          guid: crypto.randomUUID(),
          method: "unsub",
          data: { mode: "ltpc", instrumentKeys: toRemove },
        })
      )
    );
    for (const k of toRemove) optionPending.delete(k);
    console.log(`[ws] -unsub ${toRemove.length} option(s)`);
  }
  subscribedOptionKeys = desired;
}
setInterval(() => {
  reconcileOptionSubs().catch((e) => console.error("[ws] reconcile failed:", e.message));
}, SUB_POLL_MS);

function onFeed(decoded) {
  const feeds = decoded?.feeds;
  if (!feeds) return;
  const nowIso = new Date().toISOString();
  for (const [key, feed] of Object.entries(feeds)) {
    const ltpc = extractLtpc(feed);
    if (!ltpc || typeof ltpc.ltp !== "number") continue;
    const ltp = ltpc.ltp;
    const prevClose = typeof ltpc.cp === "number" && ltpc.cp > 0 ? ltpc.cp : ltp;
    const change = ltp - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    const idx = SYMBOL_BY_KEY.get(key);
    if (idx) {
      pending.set(idx.symbol, {
        symbol: idx.symbol,
        exchange: idx.exchange,
        ltp,
        prev_close: prevClose,
        change,
        change_percent: changePct,
        volume: 0,
        ts: nowIso,
        updated_at: nowIso,
      });
      continue;
    }

    // Option contract (subscribed dynamically from the registry). Option ticks
    // ride the live_quotes table, keyed by the instrument_key, so they fan out
    // on the ONE reliable Realtime channel (see src/lib/supabase/realtime-quotes).
    const opt = optionMeta.get(key);
    if (opt) {
      optionPending.set(key, {
        symbol: key,
        exchange: opt.symbol === "SENSEX" ? "BFO" : "NFO",
        ltp,
        prev_close: prevClose,
        change,
        change_percent: changePct,
        volume: 0,
        ts: nowIso,
        updated_at: nowIso,
      });
    }
  }
}

let FeedResponse;
let reconnectDelay = 2000;

async function connect() {
  const token = await getAccessToken();
  if (!token) {
    console.error("[ws] No valid Upstox token (reconnect Upstox in the app). Retrying in 30s.");
    setTimeout(connect, 30_000);
    return;
  }

  let url;
  try {
    url = await getFeedUrl(token);
  } catch (e) {
    console.error("[ws] authorize error:", e.message, "— retrying in 10s");
    setTimeout(connect, 10_000);
    return;
  }

  const ws = new WebSocket(url, { followRedirects: true });

  ws.on("open", () => {
    reconnectDelay = 2000;
    currentWs = ws;
    // Fresh socket has no server-side subs — clear our mirror so the option
    // reconciler re-subscribes the active registry set on its next tick.
    subscribedOptionKeys = new Set();
    console.log("[ws] connected; subscribing to", INSTRUMENTS.map((i) => i.symbol).join(", "));
    const sub = {
      guid: crypto.randomUUID(),
      method: "sub",
      data: { mode: "ltpc", instrumentKeys: INSTRUMENTS.map((i) => i.key) },
    };
    ws.send(Buffer.from(JSON.stringify(sub)));
  });

  ws.on("message", (data) => {
    try {
      const decoded = FeedResponse.decode(new Uint8Array(data));
      onFeed(FeedResponse.toObject(decoded, { longs: Number, enums: String, defaults: false }));
    } catch (e) {
      console.error("[ws] decode error:", e.message);
    }
  });

  ws.on("close", (code) => {
    if (currentWs === ws) currentWs = null;
    console.warn(`[ws] closed (${code}); reconnecting in ${reconnectDelay / 1000}s`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  });

  ws.on("error", (e) => {
    console.error("[ws] socket error:", e.message);
    ws.close();
  });
}

async function main() {
  const root = await protobuf.load(join(__dirname, "upstox-market-data-feed.proto"));
  FeedResponse = root.lookupType("com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse");
  console.log("[ws] proto loaded; starting Upstox market-data stream…");
  await connect();
}

main().catch((e) => {
  console.error("[ws] fatal:", e);
  process.exit(1);
});
