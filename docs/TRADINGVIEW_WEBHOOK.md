# TradingView Webhook → Paper-Trading Ledger

TradingView is the brain; this app is the **ledger + dashboard**. Your strategies
fire a webhook on every **entry** and **exit**; the app authenticates, validates,
dedupes, logs, and updates a paper-trading ledger. There is **no external price
feed** — the app records exactly what TradingView sends.

> **PAPER TRADING ONLY.** No broker API is ever called. Nothing here places a
> real order. The P&L is a directional **points × lot** proxy — it does **not**
> model real option premium (no theta / IV / delta).

---

## 1. The webhook URL

```
POST https://YOUR_DOMAIN/api/webhook/tradingview?secret=YOUR_WEBHOOK_SECRET
```

- TradingView cannot send custom headers, so auth is the **`?secret=`** query
  param (preferred) **or** a `secret` field in the JSON body. The value must
  equal `WEBHOOK_SECRET` (compared in constant time). Mismatch → **401**.
- Accepts both `application/json` and `text/plain` bodies (TradingView usually
  sends `text/plain`); the raw string is always JSON-parsed.
- Optional IP allowlist via `IP_ALLOWLIST` (CSV, OFF by default).

Local dev secret lives in `.env.local` (`WEBHOOK_SECRET=…`). Generate one:

```bash
openssl rand -hex 32
```

---

## 2. The JSON the TradingView alert must send

**ENTRY** (on a strategy entry fill):

```json
{ "secret": "YOUR_WEBHOOK_SECRET", "event": "entry", "strategy": "VWAP-MR",
  "side": "long", "option_type": "CALL",
  "symbol": "NIFTY", "timeframe": "5",
  "price": 24050.5, "sl": 24040.5, "tp": 24070.5, "qty": 1,
  "time": "2026-06-23T10:15:00Z" }
```

**EXIT** (on a strategy exit fill):

```json
{ "secret": "YOUR_WEBHOOK_SECRET", "event": "exit", "strategy": "VWAP-MR",
  "symbol": "NIFTY", "price": 24070.5, "time": "2026-06-23T10:40:00Z" }
```

Field notes:

| field | required | notes |
|---|---|---|
| `event` | yes | `"entry"` or `"exit"` |
| `strategy` | yes | separates candidates (e.g. `VWAP-MR`, `ORB`, `ST-Flip`, `ZLEMA`) |
| `symbol` | yes | e.g. `NIFTY` |
| `side` | entry only | `"long"` or `"short"` |
| `price` | yes | the entry/exit price (number) |
| `option_type` | optional | `"CALL"` / `"PUT"` (display only — P&L is directional) |
| `timeframe` | optional | string or number |
| `sl`, `tp` | optional | used to infer the exit reason |
| `qty` | optional | lots; defaults to `1` |
| `time` | optional | ISO 8601; server time is used if omitted |
| `id` | optional | dedupe key; if absent a hash of (strategy+event+symbol+price+time) is used |
| `secret` | optional | only if not using `?secret=` |

Invalid types/enums → **422** with a message naming the bad field.

**Tip — drive both from one alert:** set the strategy's `alert_message` to the
JSON above (you can use TradingView placeholders like `{{strategy.order.action}}`),
and the alert Message to `{{strategy.order.alert_message}}`.

---

## 3. TradingView alert setup (step by step)

> Webhooks require a **paid TradingView plan** and **2FA enabled** on the account.

1. Add your strategy to the chart.
2. In the strategy's Pine code, build the entry/exit JSON and pass it to
   `alert_message` on each `strategy.entry` / `strategy.close` call (see the
   payloads above).
3. Click the **alarm (Alerts)** icon → **Create Alert**.
4. **Condition** = your strategy; trigger = **"Order fills and alert() function calls"**.
5. **Message** = `{{strategy.order.alert_message}}`
6. **Once Per Bar Close**.
7. Open **Notifications → Webhook URL** and paste:
   `https://YOUR_DOMAIN/api/webhook/tradingview?secret=YOUR_WEBHOOK_SECRET`
8. Create the alert. Repeat per strategy (`strategy` field keeps them separate).

---

## 4. Paper-trading engine

**On ENTRY** for a `(strategy, symbol)`:
- No open position → **open** one (stores side, entry, sl, tp, qty, time).
- Same direction already open → **ignored** (no pyramiding).
- Opposite direction open → if `ALLOW_REVERSE=true`, **close** it (reason
  `reverse`) then open the new one; otherwise **ignore** the new signal.

**On EXIT** → find the open position for `(strategy, symbol)` and close it at the
payload price. Reason is inferred by comparing the exit price to the stored sl/tp
(within a small tolerance): near `tp` → `tp`, near `sl` → `sl`, else `manual`.

**P&L** (index points × lot, minus costs):

```
gross = (side=="long" ? exit-entry : entry-exit) * qty * POINT_VALUE
cost  = COST_PER_ORDER * 2          # entry + exit
net   = gross - cost
```

Defaults: `POINT_VALUE=65` (NIFTY lot), `COST_PER_ORDER=35` (INR). Configure via env.

**Idempotency:** repeats of the same `id` (or the hashed signal) seen within 60s
are dropped. Every raw body is persisted to `tv_webhook_logs` **before**
processing, with `status` (`received` / `processed` / `rejected`) and any error.

---

## 5. Data model (`supabase/migrations/20260625000000_tradingview_webhook.sql`)

Run that migration in the **Supabase SQL Editor** before using the webhook.

- **`tv_webhook_logs`** — `id, received_at, content_type, source_ip, raw_body,
  parsed_json, dedupe_key, status, error`
- **`tv_positions`** (open) — `id, strategy, symbol, side, option_type, timeframe,
  entry_price, sl, tp, qty, opened_at, status` — unique on `(strategy, symbol)`
- **`tv_trades`** (closed) — `id, strategy, symbol, side, option_type, entry_price,
  exit_price, qty, gross, cost, net, reason, opened_at, closed_at, duration_seconds`

These are a **shared** ledger (not per-user): the webhook writes via the
service-role admin client; any authenticated user can read. They are deliberately
separate from the per-user trade engine (`orders` / `positions`).

---

## 6. Local testing (no TradingView needed)

Start the dev server, then fire the full flow:

```bash
npm run dev
# in another terminal — loads WEBHOOK_SECRET from .env.local:
npm run tv:test
# or explicitly:
node scripts/tv-webhook-test.mjs --url http://localhost:3000 --secret YOUR_SECRET
```

The script exercises: open → no-pyramiding → dedupe → close (reason `tp`) →
401 (bad secret) → 422 (bad payload).

Single curl (entry then exit):

```bash
curl -X POST "http://localhost:3000/api/webhook/tradingview?secret=YOUR_SECRET" \
  -H "content-type: text/plain" \
  -d '{"event":"entry","strategy":"VWAP-MR","side":"long","symbol":"NIFTY","price":24050.5,"sl":24040.5,"tp":24070.5,"qty":1}'

curl -X POST "http://localhost:3000/api/webhook/tradingview?secret=YOUR_SECRET" \
  -H "content-type: text/plain" \
  -d '{"event":"exit","strategy":"VWAP-MR","symbol":"NIFTY","price":24070.5}'
```

Unit tests for the engine (auth, validation/422, P&L incl. costs, reverse,
dedupe) live in `src/lib/tv/engine.test.ts`:

```bash
npm test
```

---

## 7. Exposing localhost to TradingView

TradingView must reach a public URL. Tunnel your local server with **ngrok** or
**cloudflared**:

```bash
ngrok http 3000
# or
cloudflared tunnel --url http://localhost:3000
```

Use the printed HTTPS URL as the webhook base, appending
`/api/webhook/tradingview?secret=YOUR_SECRET`. Set the same `WEBHOOK_SECRET` in
`.env.local` (local) or your host's env (prod).
