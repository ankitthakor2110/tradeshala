# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Build & Dev Commands

- `npm run dev` — Start dev server (Next.js)
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run lint` — Run ESLint (flat config, Next.js core-web-vitals + TypeScript)
- `npm test` — Run Vitest once (`vitest run`); `npm run test:watch` for watch mode
- `npm run ws:upstox` — Run the standalone Upstox WebSocket market-data feed script (`scripts/upstox-ws.mjs`, loads `.env.local`)
- `npm run nse:deals` — Run the standalone NSE large-deals snapshot writer (`scripts/nse-largedeals.mjs`, loads `.env.local`); fetches NSE bulk/block/short deals and upserts the shared `large_deals` table. Run from a machine where NSE is reachable (NSE blocks datacenter IPs), scheduled ~10-min during market hours.
- `npm run tv:test` — Send a test TradingView webhook payload (`scripts/tv-webhook-test.mjs`)

Vitest (`vitest.config.ts`, `node` environment, `@` alias) tests **pure logic only** — it has no Next/React/DOM env. Test files are colocated as `*.test.ts` (currently `src/lib/tv/engine.test.ts`, `src/lib/tv/stats.test.ts`, `src/lib/tv/schema.test.ts`, `src/lib/tv/notify.test.ts`, `src/lib/portfolio/summary.test.ts`). Run a single file with `npx vitest run src/lib/tv/engine.test.ts`. Full verification is `npm test` + `npm run lint` + `npm run build`. Do **not** write DOM/component tests against this config — keep logic pure and testable, and put side-effecting DB/env code in the processor/service layers.

## Tech Stack

- **Next.js 16.2.1** with App Router (`src/app/`)
- **React 19** with TypeScript (strict mode)
- **Tailwind CSS v4** via PostCSS plugin (`@tailwindcss/postcss`) — uses `@import "tailwindcss"` syntax, not the v3 `@tailwind` directives
- **Supabase** for auth and database (`@supabase/ssr` + `@supabase/supabase-js`)
- **Recharts** for dashboard sparkline charts
- **Zod** for runtime payload validation (notably the TradingView webhook schema)
- **`ws` + `protobufjs`** for the Upstox WebSocket market-data feed (protobuf schema in `scripts/upstox-market-data-feed.proto`); used by the `scripts/upstox-ws.mjs` standalone feed
- **ESLint 9** flat config format (`eslint.config.mjs`)
- **Market data providers:** Dhan (primary) and Upstox (fallback), accessed via server-side API routes only — never call providers from the browser

## Important Notes

- Next.js 16 has breaking changes from earlier versions. Always check `node_modules/next/dist/docs/` for up-to-date API guides before writing Next.js code.
- Tailwind v4 config is done via CSS (`globals.css` `@theme inline` block), not `tailwind.config.js`. Custom theme tokens (e.g. `--color-primary-*`) are defined there.

## Architecture

- **App Router only** — all routes live under `src/app/`
- **Path alias:** `@/*` maps to `./src/*`
- **Root layout** (`src/app/layout.tsx`) loads Geist Sans and Geist Mono fonts via `next/font/google`; metadata is pulled from `src/config/landing.ts`

### Config-Driven UI Pattern

All user-visible strings, labels, mock data, and content live in config files under `src/config/`, **not** in components. Components import from config and render data — they never hardcode copy.

- `src/config/landing.ts` — landing page content (hero, features, stats, testimonials, footer, CTA)
- `src/config/auth.ts` — auth form labels, error messages, validation messages, blocked email domains
- `src/config/dashboard.ts` — sidebar nav items, navbar titles, market hours, greeting text, mock market data, labels
- `src/config/legal.ts` — terms and privacy content
- `src/config/trade.ts` — instrument types, order types, simulation params (slippage, brokerage), popular stocks/indices
- `src/config/portfolio.ts` / `positions.ts` / `watchlist.ts` / `profile.ts` / `journal.ts` — page titles, section/tab labels, table headers, and refresh intervals for the respective dashboard pages
- `src/config/tradingview.ts` — TradingView webhook engine knobs (server-only env reads) + `/dashboard/signals` UI copy (see TradingView Webhook below)
- `src/config/intel.ts` — all copy, thresholds, and knobs for the Market Intelligence dashboard (see Market Intelligence Dashboard below)
- `src/config/brokers.ts` — `BROKERS` list (Upstox, Zerodha): per-broker auth type, OAuth redirect URI, credential fields, and setup steps rendered by `/dashboard/broker`
- `src/config/admin.ts` — admin email gate + `isAdmin(email)` helper; lists admin-restricted pages

### Supabase Integration

- **Client-side:** `src/lib/supabase/client.ts` — browser client via `createBrowserClient`
- **Server-side:** `src/lib/supabase/server.ts` — server client via `createServerClient` (uses `cookies()`)
- **Admin (service-role):** `src/lib/supabase/admin.ts` — `createAdminClient()` uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS. Used **only** by trusted server contexts (cron + the snapshot refresh route) to write the shared `live_quotes` table. Never import this into client code.
- **Middleware:** `src/proxy.ts` exports the middleware function; calls `src/lib/supabase/middleware.ts` to refresh sessions, protect routes (`/dashboard`, `/portfolio`, `/trades`, `/watchlist` redirect to `/login`), and gate admin-only routes (`/connection-status`) on server-side `ADMIN_EMAIL` env match (non-admins are bounced to `/dashboard?error=unauthorized`)
- **Env vars required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_EMAIL` (server) and `NEXT_PUBLIC_ADMIN_EMAIL` (client, used by `useAdmin` hook) — keep them equal. Broker/market-data keys (e.g. `DHAN_*`, `UPSTOX_*`), the `SUPABASE_SERVICE_ROLE_KEY` (admin client), `CRON_SECRET` (Vercel Cron Bearer auth), `BROKER_ENCRYPTION_KEY` (broker credential encryption), and the TradingView webhook knobs (`WEBHOOK_SECRET`, `TV_ENGINE_EXECUTION`, etc.) live server-side only. See `.env.local.example`.
- **Database types:** `src/types/database.ts` — typed `Database` interface for tables: `profiles`, `portfolios`, `trades`, `watchlist`, `holdings`, `broker_connections`. The `orders` and `positions` tables exist in the DB (used by the trade engine) but are typed inline via `Order` / `Position` interfaces rather than listed in the `Database` schema — cast inserts with `as never` when writing to them (see `trade-engine.service.ts`).

### Database Migrations

SQL migrations live in `supabase/migrations/`, named `<UTC-timestamp>_<slug>.sql` and applied **in filename order**. There is no automated migration runner wired into the app — migrations are **run manually by pasting into the Supabase Dashboard → SQL Editor**, and should be written to be idempotent + safe to re-run. When you add a table, column, RPC (e.g. `deduct_virtual_cash`), or RLS policy, add a new timestamped migration file; don't edit existing ones. `supabase/security/rls_audit_and_policies.sql` is a standalone audit+remediation script (RLS is the only thing isolating one user's rows from another's, since the browser/server talk to Postgres with the anon key + user session — never a service-role key except in the two trusted server writers noted above). After adding schema, update `src/types/database.ts` to match.

### API Routes (`src/app/api/`)

All provider/broker I/O and any access to server-only env vars must happen in route handlers — never call providers directly from client components. Existing routes:
- `api/market-data/{indices,quote,gainers-losers,search,health}` — read-only market data
- `api/trade/{expiries,option-chain,candles,option-stream}` — derivatives data for the trade simulator (`option-stream` streams option quotes; `candles` serves OHLC history)
- `api/broker/*` — broker OAuth / connection flows (Upstox, Zerodha): `oauth/{initiate,callback}`, `reconnect`, `save`, `test`, `market-data`, `upstox/status`
- `api/account/delete` — self-service account deletion (session-gated)
- `api/admin/env-status` — admin-only diagnostics, consumed by `/connection-status`
- `api/market-data/snapshot` — Vercel Cron entry (GET, gated by `Authorization: Bearer ${CRON_SECRET}`); see Live Market Data below
- `api/market-data/snapshot/refresh` — client-driven refresh (POST, gated by the caller's Supabase session); see Live Market Data below
- `api/cron/upstox-reauth` — daily cron that surfaces/repairs Upstox token expiry (also `CRON_SECRET`-gated)
- `api/webhook/tradingview` — TradingView strategy-alert webhook (POST, `nodejs` runtime, secret-gated); see TradingView Webhook below
- `api/tv/reset` — admin-gated reset of the TradingView paper-trading ledger

Client code reaches these via helpers in `src/services/market-data.service.ts` (thin `fetch` wrappers that return typed shapes).

### Market Data Provider Layer (`src/lib/market-data/`)

- `dhan.ts` and `upstox.ts` each expose the same surface: `isXConfigured()`, `testConnection()`, `fetchQuote`, `fetchIndices`, `fetchGainersLosers`, `searchStocks`.
- `index.ts` picks a primary provider based on which keys are configured (Dhan preferred) and falls back to the other if the primary returns empty. Every response is tagged with a `source: "dhan" | "upstox" | "unavailable"` so UI can render the `LiveBadge` accurately.
- When adding a new provider, add a module that implements this same surface, then wire it into `index.ts` — do not bypass the aggregator.

### Service Layer

Business logic lives in `src/services/`, not in components or route handlers. Route handlers orchestrate; services hold the rules.
- `src/services/auth.service.ts` — signUp, signIn, signOut, getCurrentUser, sendPasswordReset, resetPassword
- `src/services/dashboard.service.ts` — getMarketStatus (IST market hours), getGreeting, getPortfolioStats
- `src/services/market-data.service.ts` — client-side fetchers that call `/api/market-data/*`
- `src/services/broker.service.ts` — broker-connection CRUD against the `broker_connections` table (get active/all connections, connect/test) via the browser Supabase client
- `src/services/trade-engine.service.ts` — order validation, fill simulation (slippage + brokerage from `TRADE_CONFIG.simulation`), position upsert/close, P&L math. Writes to `orders` + `positions` and calls the Postgres RPCs `deduct_virtual_cash` / `add_virtual_cash` to move the user's `virtual_balance`. MARKET orders fill instantly; LIMIT/SL/SL-M stay `PENDING` until price condition is met. Also executes multi-leg option strategies (all-long legs placed together). `simulateFill` is the pure fill helper reused by the server engine.
- `src/services/trade-engine.server.ts` — server-side bridge that maps a TradingView signal to a simulator order using the **service-role** admin client (webhooks have no user session): entry long → BUY ATM CALL, entry short → BUY ATM PUT (or the payload's `option_type`) at the nearest expiry, priced live from the chain; exit → close it. Only ever BUYs-to-open / SELLs-to-close (no option writing). Runs only when `TV_ENGINE_EXECUTION` is on.
- `src/services/positions.service.ts` — read/aggregate the user's open/closed positions for the positions page.
- `src/services/portfolio.service.ts` — portfolio holdings/summary aggregation (see `src/lib/portfolio/summary.ts` for the pure math).
- `src/services/watchlist.service.ts` — watchlist CRUD against the `watchlist` table via the browser client.
- `src/services/tradingview.service.ts` — client-side readers for the `tv_*` paper-trading ledger (open positions, closed trades) plus the admin reset call. The `tv_*` tables are RLS-select-readable by any authenticated user, so reads go direct through the browser client.
- `src/services/intel.service.ts` — thin client-side fetchers for the Market Intelligence dashboard; reuse the existing `/api/trade/*` routes (no dedicated intel API) and return typed shapes to `useIntelData`.

### Live Market Data: Snapshot + Realtime

Intra-day prices flow through a shared Postgres table, **not** per-client provider calls. Understand all four pieces together:

- **`snapshotOnce(admin)`** (`src/lib/market-data/snapshot.ts`) — one pass: resolve the active universe (`universe.ts`), batch-fetch LTPs from Upstox (`fetchLtpBatch`), and upsert into `live_quotes` (keyed on `symbol`). Returns rows written.
- **Server writers** — two callers of `snapshotOnce`: the Vercel Cron route (`api/market-data/snapshot`, `CRON_SECRET`-gated, loops within its 300s budget while the market is open) and the client-triggered route (`api/market-data/snapshot/refresh`, session-gated, one pass per call, throttled by `MIN_REFRESH_GAP_MS` so many tabs collapse into ~one provider call per window).
- **`useSnapshotPoller`** (client) — while a live page is mounted, periodically calls the refresh route. Pauses when the tab is hidden or the market is closed. This exists because the **Vercel Hobby plan caps cron at once/day**; on Pro the cron writer alone would keep data fresh.
- **`useLiveQuotes`** (client) — subscribes to `live_quotes` via Supabase **Realtime**; rows written by any server writer fan out to every open tab. So one poller refreshes prices for all clients — never call providers from the browser.

### TradingView Webhook (Paper-Trading Ledger)

**Paper trading only — this subsystem never places a real broker order; no broker client exists on this path.** TradingView strategy alerts POST to `api/webhook/tradingview` and flow through:

- **`src/lib/tv/`** holds the pure, unit-tested logic (no DB/env/clock): `engine.ts` (constant-time `secretsMatch` via `node:crypto`, `dedupeKey`, `ipAllowed`, exit-reason inference, `round2`), `schema.ts` (Zod `validateWebhook`), `stats.ts` (win-rate/profit-factor/expectancy/drawdown), and `processor.ts` (wires the pure logic into Supabase writes: `insertLog`/`updateLog`/`isDuplicate`/`applySignal`).
- **Route** (`nodejs` runtime, `force-dynamic`): reads the raw body (TradingView sends `text/plain`), JSON-parses regardless of content-type, checks the secret + IP allowlist, **normalizes**, dedupes, validates, then `applySignal` writes the `tv_*` ledger. If `TV_ENGINE_EXECUTION` is on, it **also** calls `executeOnEngine` (`trade-engine.server.ts`) to place a paper order in the simulator, and if Telegram is configured it fires an alert (see below). Engine/Telegram failures are caught and reported, never failing the webhook — the ledger is the source of truth.
- **Inbound normalization** (`normalizeInbound` in `schema.ts`, pure/tested): maps broker-style TradingView alerts to the canonical shape before validation — `ticker→symbol`, numeric-string `price/sl/tp/qty`→numbers, epoch s/ms `time`→ISO, and `action: BUY/SELL`→`event:"entry"` + `side:"long"/"short"`. Action (BUY/SELL) payloads use the **flip / always-in-market model**: an opposite signal reverses (closes the open position, books the trade, opens the other side) — the route forces `allowReverse` for them regardless of the `ALLOW_REVERSE` env, so a SELL is never silently dropped. Native `event`-shaped payloads pass through and still honor `ALLOW_REVERSE`.
- **P&L model:** a directional **points × lot − costs** proxy (`POINT_VALUE`, `COST_PER_ORDER`) — **not** real option premium (no theta/IV/delta). The dashboard (`/dashboard/signals`, config in `src/config/tradingview.ts`) always shows this disclaimer.
- **Telegram alerts** (`src/lib/tv/notify.ts`, optional): when `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` are set, each actionable result (`opened`/`closed`/`reversed`) posts an HTML message via the Bot API. `buildAlertText` is pure/tested; `sendTelegramAlert` never throws. Server-only — never import into client code.
- **Config/env:** `src/config/tradingview.ts` reads server-only env (`WEBHOOK_SECRET`, `IP_ALLOWLIST`, `ALLOW_REVERSE`, `TV_ENGINE_EXECUTION`, `TV_ENGINE_REQUIRE_LIVE`, `WEBHOOK_TRADE_USER_EMAIL`, `POINT_VALUE`, `COST_PER_ORDER`). Import only from server code. `TV_ENGINE_REQUIRE_LIVE` (default on) refuses engine fills when the option chain resolves to MOCK prices, so fills are never booked at fabricated premiums. Telegram creds (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) are read directly in `notify.ts`.
- **Types:** `src/types/tradingview.ts` (`TvPosition`, `TvTrade`, `TvSide`, `TvExitReason`, …).

### Broker Credential Encryption

Sensitive broker credentials (`api_secret`, `access_token`, `totp_secret`) are encrypted at rest via `src/lib/crypto/secrets.ts` (AES-256-GCM, per-value random IV, stored as `enc:v1:<iv>:<tag>:<ciphertext>`). The key comes from the server-only `BROKER_ENCRYPTION_KEY` env var (any string, normalized to 32 bytes via SHA-256). **Server-only — never import into client code.**

### Dashboard Pages

Live pages under `src/app/dashboard/`: `page.tsx` (overview), `trade` (options simulator), `intel` (Market Intelligence, see below), `positions`, `portfolio`, `watchlist`, `journal`, `signals` (TradingView ledger), `broker`, `profile`. Each has a matching config module in `src/config/`.

### Options Market-Data Helpers (`src/lib/market-data/`)

Beyond the provider aggregator, derivatives helpers back the trade simulator and the webhook engine: `expiries.ts` (`getExpiries`), `option-chain.ts` (`fetchOptionChain`, live-vs-mock tagged), `iv-history.ts`, `instruments.ts` / `upstox-instruments.ts` (symbol ↔ instrument-key resolution). Server-side only.

### Automatic Trade Taker (`/dashboard/auto` + config-driven webhook execution)

Builds on the TradingView webhook to turn incoming signals into **configurable** automatic paper option-trades. **Paper trading only — no broker client on this path.** It sits alongside (never replaces) the tv_* ledger and the legacy env engine.

- **Pure, unit-tested logic** in `src/lib/auto/` (no DB/env/clock): `config.ts` (`DEFAULT_AUTO_CONFIG`, `mergeConfig`, `validateConfig`), `strike.ts` (ATM/ITM/OTM/Offset/Delta selection — delta uses real chain greeks and never invents a delta, side-aware ITM/OTM), `targets.ts` (%/points/price/RR + trailing), `quantity.ts` (lots/fixed/risk, real lot size), `risk.ts` (daily limits + open-position action), `session.ts` (market-window gate), `pipeline.ts` (`planEntry` → a `Decision` with a full audit trail). Colocated `*.test.ts` cover all of it — keep new auto math here.
- **Server bridge** `src/services/auto-trade.server.ts`: `runAutoTrade` loads the account's `trading_configs` row, evaluates via `planEntry`, and (when AUTOMATIC + all gates pass) executes through the shared `placeOptionBuyToOpen` helper extracted in `trade-engine.server.ts` (reused by the legacy env engine too). Returns `{handled:false}` when no config row exists so the webhook **falls back to the legacy env engine** — existing deployments are unchanged. Writes an `auto_trade_decisions` audit row per signal.
- **Modes** (`config.mode`): MANUAL (record only), SEMI (PROPOSED — approve/reject in the Signals decision modal), AUTOMATIC (execute). Plus a global `enabled` safety toggle, `dryRun`, and an `emergency_stopped` STOP/RESUME override. Exits and target/SL/trailing/breakeven are monitored by the existing `runGttOnce` GTT pass (breakeven added via `positions.be_activation`/`be_offset`).
- **Idempotency/concurrency** (spec-mandated): a partial unique index on `auto_trade_decisions(user_id, dedupe_key)` reserves each signal — a duplicate/concurrent identical webhook loses the race and is recorded DUPLICATE, never double-traded.
- **DB** (`20260821000000_auto_trading.sql`): `trading_configs` (active per-user config JSON + version + emergency flag), `trading_config_versions` (audit history — a decision references the version active at execution), `auto_trade_decisions` (per-signal decision + audit trail + links to `orders`/`positions`). All own-row RLS; the webhook writes via the service-role client.
- **API** (`src/app/api/trading/*`): `config` (GET/PUT, versioned), `auto` (emergency stop/resume), `status` (automation counters), `test-signal` (dry-run/execute preview), `decision` (semi-auto approve/reject). Config/copy in `src/config/autoTrade.ts`; client fetchers in `src/services/auto-trade.service.ts`; types in `src/types/autoTrade.ts`; UI in `src/components/auto/` + `/dashboard/auto` and the enhanced `/dashboard/signals` decisions table.

### Market Intelligence Dashboard (`/dashboard/intel`)

An institutional decision-support screen for NIFTY scalping — **not** a plain option chain. It composes live Upstox/Dhan data with transparently-derived signals, and **never fabricates numbers**: every panel carries a data-provenance badge (`LIVE` / `DERIVED` / `HISTORICAL` / `NO FEED` via `DataBadge`), and sections with no feed (Futures, VIX, breadth, sector) render honest placeholders (`NoFeedCard`) instead of faked values.

- **Pure, unit-tested logic** in `src/lib/intel/` (no DB/env/clock): `candles.ts` (VWAP with a volume-less index fallback, ATR, opening range, trend), `optionchain.ts` (side-aware OI-buildup classification, PCR, max pain), `sentiment.ts`, `setups.ts`, `checklist.ts`, `insights.ts` (rule-based, not an LLM), `verdict.ts`, `events.ts` (event-risk gate — see below). Colocated `*.test.ts` cover these — keep new intel math here and testable.
- **Event risk** (`events.ts` + `EventRiskPanel`): a scheduled macro/expiry calendar → a trade gate (`ok` / `caution` / `avoid`) based on how close the next high-impact event is; surfaced as its own `SCHEDULED`-badged panel and a caution strip in the verdict hero. The macro list in `INTEL_CONFIG.events.calendar` is **user-maintained and empty by default** (an unverified date would break the never-fabricate rule); the weekly F&O expiry event is **auto-derived from the live expiry feed**, so it works with no manual entry. `"clock"` is passed in (`Date.now()` from the hook at poll cadence; the panel runs its own 1s countdown so only it re-renders per second). Added a `"scheduled"` `DataProvenance` for its badge.
- **OI change is self-computed** via in-browser session diffs, because the providers report OI change as `0`. This state lives in the client hook, not the server.
- **Orchestration** is `src/hooks/useIntelData.ts` (client); it calls thin fetchers in `intel.service.ts` that reuse the existing `/api/trade/*` routes — there is **no** dedicated intel API route.
- **Components** live in `src/components/intel/`; all copy, thresholds, and knobs are in `src/config/intel.ts`.

### Admin Gating

Two layers, both required:
1. **Server (middleware):** `ADMIN_EMAIL` env check in `src/lib/supabase/middleware.ts` — the security boundary.
2. **Client (`src/hooks/useAdmin.ts` + `src/config/admin.ts`):** `NEXT_PUBLIC_ADMIN_EMAIL` — used only to hide/show UI (e.g. the "Connection Status" sidebar item). Never rely on this for authorization.

### Type System

Types are split by domain under `src/types/`:
- `auth.ts` — form data interfaces, `ValidationResult`, `PasswordStrength`
- `database.ts` — Supabase row types (`Profile`, `Portfolio`, `Trade`, `WatchlistItem`) and the `Database` schema type; `Order` / `Position` are typed inline (see note above)
- `tradingview.ts` — `TvPosition`, `TvTrade`, `TvSide`, `TvExitReason` for the webhook ledger
- `landing.ts` / `legal.ts` — landing and legal page config types

### Hooks (`src/hooks/`)

- `useAdmin.ts` — client-side admin UI gate (reads `NEXT_PUBLIC_ADMIN_EMAIL`; UI-only, never authorization)
- `useAuthRedirect.ts` — redirects based on auth state
- `useBrokerConnection.ts` — derives active-broker connection state (connected, expiry/expiring-soon) from `broker.service.ts`
- `useIsMounted.ts` — the mounted-state helper used to avoid hydration mismatches (see Hydration Rules)
- `useLiveQuotes.ts` / `useSnapshotPoller.ts` — Realtime price subscription and the client-side snapshot poller (see Live Market Data)
- `usePositions.ts` — derives the user's positions/P&L state from `positions.service.ts`
- `useIntelData.ts` — orchestrates the Market Intelligence dashboard: fetches via `intel.service.ts`, runs the pure `src/lib/intel/*` math, and holds the in-browser OI-diff session state (see Market Intelligence Dashboard)

### Shared Utilities

- `src/utils/validation.ts` — email, password, full name validators (uses rules from `authConfig`)
- `src/utils/colors.ts` — P&L color helpers (`getPnLColor`, `getPnLBgColor`, `formatPnL`)
- `src/utils/format.ts` — `timeAgo` and `formatOI` (Cr/L/K compaction for Indian number formatting)
- `src/utils/broker.utils.ts` — broker connection/token helpers (e.g. expiry computation) used by `useBrokerConnection`
- `src/styles/interactions.ts` — `INTERACTION_CLASSES` object with pre-built Tailwind class strings for buttons, links, cards, inputs
- `src/context/LoadingContext.tsx` — `LoadingProvider` / `useLoading` context for global loading state
- `src/components/ui/LiveBadge.tsx` — renders data-source pill (dhan/upstox/unavailable) on market widgets
- `src/components/ui/Skeleton.tsx` — loading placeholder used by data-fetching pages (see Loader Rules in `CLAUDE_RULES.md`)

## UI & Interaction Rules

The full rulebook (cursors, loaders, sidebar dimensions, per-element hover/active requirements) is in `CLAUDE_RULES.md` at the repo root — read it before building UI. Summary:

All interactive elements **must** use classes from `INTERACTION_CLASSES` (`src/styles/interactions.ts`). Key requirements:
- Every button needs `cursor-pointer`, hover state, `active:scale-95`, disabled states
- Every link needs `cursor-pointer` and hover state
- Clickable cards need hover lift (`-translate-y-1`) and border highlight
- Form inputs need focus ring (`focus:ring-2 focus:ring-violet-500/50`)

### Color Conventions

- **Violet** → UI elements (buttons, nav, branding, primary accent)
- **Green** → Positive financial values (profit, gainers)
- **Red** → Negative financial values (loss, losers)
- **Gray** → Neutral/zero values

### Hydration Rules

- `"use client"` on all interactive components
- Use mounted state pattern (`useState(false)` + `useEffect(() => setMounted(true))`) before rendering time-dependent or browser-API content
- No `typeof window` checks in JSX; no `<a>` inside `<Link>`
