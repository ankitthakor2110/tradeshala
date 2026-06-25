# TradeShala — Application Status Report

_Last updated: 2026-06-25. Method: full code + data-path audit (5 parallel area audits) plus everything verified live this session. Items that need a **browser/live env** to confirm (visual rendering, real OAuth round-trips, Realtime fan-out, email delivery) are marked **🌐 browser-verify**._

**Legend:** ✅ Working · ⚠️ Works but needs improvement · ❌ Broken/missing · 🟡 Uses mock/synthetic data

---

## 0. Fixed in this pass (just implemented, verified lint+build+tests)

| Fix | What changed |
|---|---|
| **Post-order → Positions redirect** | After an order **executes**, the Trade page now navigates to `/dashboard/positions?highlight=SYMBOL` (your requested flow). The Positions page reads `?highlight=`, jumps to the Open tab, filters to that symbol, and toasts "Showing your latest trade" — so the new trade + its live P&L are front-and-centre. PENDING (unfilled LIMIT/SL) orders correctly show a "waiting for execution" message instead (no position yet). |
| **Positions now self-refreshes prices** | Positions page mounts `useSnapshotPoller` — equity LTPs stay live even when it's the only open tab. |
| **🔴 `oauth/initiate` UDAPI100068 bug** | `redirect_uri` now derives from the request origin (`getPublicOrigin`) and prefers the per-deploy env key — same fix already in reconnect/callback. The broker-page "token expiring → refresh" buttons no longer reproduce the Upstox error for env-only setups. |
| **Dashboard stat cards → real data** | Home cards (Virtual Cash / Portfolio Value / P&L / P&L%) now come from the live positions summary + `virtual_balance`, replacing the hardcoded `mockStats` (which always showed ₹10L / 0 / 0). |
| **Banner copy** | "Auto-refreshes every 30s" → "15s" (matches the actual poll interval). |

### Pass 2 (recommended improvements — now implemented, verified lint+build+tests)

| Fix | What changed |
|---|---|
| **Watchlist → Supabase** | New `watchlist.service.ts`; the page now loads/adds/removes via the `watchlist` table (was localStorage-only) so it syncs across devices/sessions. Optimistic UI with revert-on-failure. Verified insert/read/delete against the live table. |
| **Reset-password recovery guard** | The page now checks for a Supabase recovery session (PASSWORD_RECOVERY / `getSession`, 2.5s fallback) and shows an "invalid/expired link → request a new one" state instead of a form that only fails on submit. |
| **True account deletion** | New admin-gated `POST /api/account/delete` deletes the **auth user** via the service-role client (cascades to profiles + all user-scoped tables); `deleteAccount` now calls it after password re-verify, so the login is actually revoked (was only deleting the profile row). |
| **Strategy-builder redirect** | After a multi-leg strategy places ≥1 leg, it now redirects to `/dashboard/positions?highlight=SYMBOL` (consistent with single-order placement). |
| **New-trade auto-appear** | `usePositions` now re-fetches on tab focus/visibility, so a trade placed in another tab shows without a manual refresh. |
| **Reconnect email → env** | `UPSTOX_RECONNECT_EMAIL` now reads `NEXT_PUBLIC_UPSTOX_RECONNECT_EMAIL` (falls back to the original) — no longer hardcoded in source. |

---

## 1. Auth & Profile

| Feature | Status | Notes |
|---|---|---|
| Signup | ✅ | Full validation; profile row created by `handle_new_user` trigger. |
| Login | ✅ | Suspense-wrapped, success/confirmed banners. |
| Logout | ✅ | Navbar → `signOut()` → `/login`. |
| Password reset (request) | ✅ | Resend email with redirect to `/reset-password`. |
| Password reset (set new) | ⚠️ | No recovery-session guard — a user on an expired/invalid link sees a live form and only learns it failed on submit. |
| Session refresh / route protection / admin gating | ✅ | Middleware refreshes session + protects `/dashboard` etc.; two-layer admin gate. |
| Profile view / edit / change password | ✅ | Validated; change-password re-verifies current password. |
| Delete account | ⚠️ | Only deletes the `profiles` row; the `auth.users` record persists (client SDK can't delete it) — user can still log in. Needs a server/admin endpoint. |

## 2. Dashboard, Watchlist & Market Data

| Feature | Status | Notes |
|---|---|---|
| Index tiles | ✅ 🌐 | Live via aggregator + Realtime; sparklines are 🟡 synthetic (seeded from mock, live ticks shift the array). |
| Gainers / Losers | ✅ 🌐 | Upstox computes from a fixed basket; Dhan uses real endpoints; falls back to mock if empty. |
| **Portfolio stat cards** | ✅ **(fixed)** | Now real (was hardcoded mock). `getPortfolioStats` in dashboard.service is now dead code (reads the unused `portfolios` table) — safe to delete later. |
| Market status banner | ✅ | IST-hours phase logic. |
| Search | ✅ 🌐 | Debounced; provider-backed. |
| Watchlist add/remove/view | ⚠️ | **localStorage-only** — doesn't sync across devices, lost on cache clear. A `watchlist` table is already typed but unused. |
| Live price updates | ✅ 🌐 | Realtime + poller; symbols outside the streamed universe show no price. |
| LiveBadge | ✅ | dhan/upstox/cache/demo pills. |

## 3. Trade Page & Order Engine

| Feature | Status | Notes |
|---|---|---|
| **Post-order UX** | ✅ **(fixed)** | Now redirects to Positions on execution (see §0). Strategy-builder still just closes the modal — see recommendations. |
| Symbol search / order ticket / option chain / strike select | ✅ 🌐 | Rich terminal; live overlay. |
| MARKET / LIMIT / SL / SL-M | ✅ | Correct fill simulation; LIMIT/SL stay PENDING until price hit. |
| BUY + SELL/short, cash math | ✅ | Direction-aware; hardened to fail loudly on a position-write error (no silent cash loss). |
| Fill charges / margin (SPAN-style) | ✅ | Indian statutory charges; spread margin nets a protective long. |
| Payoff / POP / IV skew / smart-entry / calendar spreads | ✅ 🌐 | Work when the feed supplies greeks; degrade silently otherwise. |
| Multi-leg strategy builder | ⚠️ | Legs placed via N separate orders — **not atomic** (partial fills possible; margin charged leg-by-leg). |
| Data-source fallbacks | 🟡 🌐 | Chain/candles/expiries fall back to mock when no provider; equity candles always mock. |

## 4. Positions & Journal

| Feature | Status | Notes |
|---|---|---|
| Open table w/ live P&L, closed, summary stats | ✅ 🌐 | Real data, direction-aware; **now self-polls (fixed)**. |
| Close / partial-close / add | ✅ | Lot-aligned presets. |
| SL / Target / Trailing / Scale-out (client + server GTT) | ✅ / ⚠️ | Server GTT (`runGttOnce`) **is wired** into both snapshot routes. Client trailing-stop peak lives in a ref → resets on reload (server persists `trail_peak`). |
| Net Greeks / payoff / P&L trend / CSV / grouping | ✅ 🌐 | Payoff is per-leg only (no combined strategy payoff). |
| Auto square-off | ⚠️ | Client-only (page must be open); no server fallback. |
| New trade auto-appears | ⚠️ | Positions fetched once on mount (no Realtime on `positions` table). The post-order redirect mitigates this; a tab left open still needs Refresh. |
| Journal (tags/notes/R-multiple/filters/CSV) | ✅ | No mock data. |

## 5. Signals (TradingView), Broker & Live Data

| Feature | Status | Notes |
|---|---|---|
| TV webhook (auth/validation/dedupe/engine) | ✅ | Constant-time secret, zod 422, 60s dedupe, paper-only. |
| TV dashboard (stats/equity curve/reset) | ✅ | 3s polling (not Realtime); admin-gated reset. |
| Broker connect (multi-step UI) | ✅ 🌐 | |
| OAuth callback / reconnect | ✅ | Request-origin redirect_uri; env-key preferred; CSRF state check. |
| **OAuth initiate** | ✅ **(fixed)** | Was the remaining UDAPI100068 source — now aligned. |
| Reconnect banner / 9 AM reauth email | ✅ / ⚠️🌐 | Banner self-clears; email depends on `CRON_SECRET` + Resend + Vercel cron schedule. |
| Shared-token resolution | ✅ | One managing login powers cron + all users. |
| Live snapshot writer / universe / cron / refresh / poller | ✅ 🌐 | Verified live this session. |
| Realtime fan-out | ✅ | Confirmed delivering this session (after enabling Replication on `live_quotes`). |

## 6. Portfolio (built this session)

| Feature | Status | Notes |
|---|---|---|
| Account-summary page (value, cash, P&L, allocation donut, equity curve) | ✅ | Live data; pure calc unit-tested (9 tests) + verified via DB round-trip. |

---

## Pass 3 — previously-open items, now implemented (verified lint+build+tests)

| Item | What changed |
|---|---|
| **Atomic multi-leg strategy** | `placeStrategy` now rolls back already-placed legs (opposite MARKET order each) if any leg fails — effectively all-or-nothing, no partial/naked positions. |
| **Server-side auto-square-off** | New `profiles.auto_square_off` (migration `20260626`); the toggle persists to it; `runGttOnce` closes all opted-in users' open positions past the 15:20 IST cutoff — fires without a tab open. |
| **Real sparklines** | Dashboard index tiles seed from real intraday candle closes (`getCandles`), falling back to the synthetic series if unavailable. |
| **Combined multi-leg payoff** | Positions page shows a net at-expiry payoff curve across the open option legs of the most-active underlying (≥2 legs). |
| **`isLive` accuracy** | `usePositions` now derives `isLive` from the Realtime channel state, not from whether prices happened to arrive. |
| **Removed dead `getPortfolioStats`** | Deleted (it read the unused `portfolios` table; no callers). |
| **TV ledger Realtime** | `useTvLedger` subscribes to `tv_positions`/`tv_trades` for instant updates; 3s poll remains as a fallback. |

### New config / migration dependencies from Pass 3
- **Run migration `20260626000000_auto_square_off.sql`** (adds `profiles.auto_square_off`) for server-side square-off.
- For instant TV updates, enable Supabase **Realtime on `tv_positions` + `tv_trades`** (same Replication toggle as `live_quotes`); otherwise the 3s poll covers it.

## Recommended improvements — still open

_None outstanding from the original audit — all addressed across Pass 1–3._ Remaining work is product direction (new features), not fixes.

---

## Config / env checklist (for the deployed app to fully work)
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (set on Vercel too), `UPSTOX_API_KEY`/`UPSTOX_API_SECRET`/`UPSTOX_ACCESS_TOKEN`, `WEBHOOK_SECRET`, `RESEND_API_KEY`/`EMAIL_FROM`/`EMAIL_TO`, `NEXT_PUBLIC_APP_URL`, `BROKER_ENCRYPTION_KEY`, `ADMIN_EMAIL`/`NEXT_PUBLIC_ADMIN_EMAIL`. Upstox app redirect URI must be registered for the deployed domain (now auto-matched by the code).
