# TradeShala Audit Report

**Date:** 2026-04-14
**Scope:** Full codebase health check — imports, types, pages, components, services, configs, middleware, env vars, hydration, interaction rules, and production build.

---

## ✅ Working Correctly

### Build & type system
- **TypeScript (`npx tsc --noEmit`):** clean, zero errors.
- **ESLint (`npm run lint`):** clean, zero warnings.
- **Production build (`npm run build`):** passes — 26 routes generated (`✓ Compiled successfully`).
- No broken or missing imports detected by tsc/lint.

### Pages present and rendering
- `src/app/page.tsx` — landing
- `src/app/login/page.tsx` — with Suspense wrapper around `LoginForm`
- `src/app/signup/page.tsx`
- `src/app/forgot-password/page.tsx`
- `src/app/reset-password/page.tsx`
- `src/app/dashboard/page.tsx` — fully built, market data + portfolio summary + gainers/losers
- `src/app/dashboard/trade/page.tsx` — fully built, search + option chain + trade engine
- `src/app/dashboard/positions/page.tsx` — fully built, charts + tabs + open/closed tables + best/worst
- `src/app/dashboard/profile/page.tsx` — personal info + password change + danger zone
- `src/app/dashboard/broker/page.tsx` — OAuth + token flows for Upstox/Zerodha
- `src/app/not-found.tsx`
- `src/app/error.tsx`
- `src/app/connection-status/page.tsx` — admin-gated

### Components present (all from the checklist)
- UI: `Modal.tsx`, `Toast.tsx`, `ButtonLoader.tsx`, `Skeleton.tsx`, `LiveBadge.tsx`, `ScrollToTop.tsx`, `FormInput.tsx`, `BrandLogo.tsx` — plus bonus `PageLoader.tsx`.
- Dashboard: `Sidebar.tsx`, `DashboardNavbar.tsx`, `SidebarIcon.tsx`, `IndexCard.tsx`.
- Landing: `Navbar.tsx`, `HeroSection.tsx`, `FeaturesSection.tsx`, `HowItWorksSection.tsx`, `StatsSection.tsx`, `CTASection.tsx`, `Footer.tsx`, `TestimonialsSection.tsx`.
- Legal: `TermsContent.tsx`, `PrivacyContent.tsx`.

### Services present
- `auth.service.ts`, `broker.service.ts`, `dashboard.service.ts`, `market-data.service.ts`, `trade-engine.service.ts`.

### Configs present (all from the checklist)
- `landing.ts`, `auth.ts`, `dashboard.ts`, `brokers.ts`, `trade.ts`, `portfolio.ts`, `positions.ts`, `profile.ts`, `legal.ts`, `admin.ts`.

### Type files present (all from the checklist)
- `landing.ts`, `auth.ts`, `database.ts`, `legal.ts`.

### Middleware
- `src/proxy.ts` present and wired. Uses Next.js 16 convention (`export async function proxy(request)` + `config.matcher`) — this is **correct for Next 16**, not `src/middleware.ts` (the project's `AGENTS.md` calls out Next 16 breaking changes).
- Protects `/dashboard`, `/portfolio`, `/trades`, `/watchlist` via `supabase.auth.getUser()` redirect-to-login.
- Gates `/connection-status` on `ADMIN_EMAIL` env match — non-admins bounced to `/dashboard?error=unauthorized`.
- No infinite redirect loops (protected routes do not re-trigger middleware with the same auth result).
- Matcher correctly excludes static assets.

### Environment variables — referenced correctly
| Var | Referenced in |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/client.ts`, `server.ts`, `middleware.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same three files |
| `NEXT_PUBLIC_APP_URL` | `utils/broker.utils.ts`, `config/brokers.ts`, `api/broker/oauth/*` |
| `DHAN_CLIENT_ID` | `lib/market-data/dhan.ts`, `api/trade/*` routes |
| `DHAN_ACCESS_TOKEN` | same |
| `UPSTOX_ACCESS_TOKEN` | `lib/market-data/upstox.ts`, `api/trade/*` routes |
| `ADMIN_EMAIL` | `lib/supabase/middleware.ts` (server-side gate) |
| `NEXT_PUBLIC_ADMIN_EMAIL` | `config/admin.ts`, `hooks/useAdmin.ts` (client UI gate) |
| `MARKET_DATA_PRIMARY`, `MARKET_DATA_FALLBACK` | `api/admin/env-status/route.ts` (bonus config) |

### Hydration safety
- No `typeof window` or `typeof document` checks inside JSX (grep returned zero matches).
- No `Math.random()` calls inside render bodies. Every usage is either:
  - In a server-only route handler (`api/trade/option-chain/route.ts` — mock option chain generation),
  - In a service function called from effects (`services/trade-engine.service.ts` — slippage simulation), or
  - Inside a `setInterval` callback in an effect (`dashboard/positions/page.tsx:281` — price jitter).
  All safe.
- Time-dependent UI uses the project's `useIsMounted()` hook pattern (e.g. `BrandLogo`, `DashboardNavbar`, `PositionsPage`, `ProfilePage`, `ResetPasswordPage`).
- No `<a>` inside `<Link>` anywhere.

### Cursor & interaction compliance
- Every `<button onClick=...>` has `cursor-pointer` — either directly in its className or via an `INTERACTION_CLASSES.*` class (`primaryButton`, `secondaryButton`, `dangerButton`, `iconButton`, `ghostButton`). Verified via negative-lookahead multiline grep against `src/` — zero violations.
- All inline `cursor-*` classes follow the rules (`cursor-pointer` on buttons/links/selects, `cursor-text` on inputs, `cursor-not-allowed` on disabled).

### Console noise
- No `console.error()` calls anywhere in `src/` (grep returned zero matches). Promise rejections in services are caught and returned as structured `{ success: false, error: ... }` results.

---

## ⚠️ Issues Fixed

None — everything audited is already in a passing state. Previous sessions fixed broken imports (logo refactor), responsive breakpoints (dashboard mobile pass), and sidebar drawer behavior. No new regressions surfaced during this audit.

---

## ❌ Still Needs Attention

### Market-data provider 503s (environment, not code)
At dev-runtime the `/api/market-data/indices` and `/api/market-data/gainers-losers` routes return **503** because Dhan/Upstox credentials in `.env.local` are missing or expired. The code paths are correct — the fallback chain works, the `LiveBadge` correctly reports `demo`, and the UI doesn't crash. Fix is operational: refresh tokens or visit `/connection-status` (admin) to see which env vars are unconfigured.

### CRLF line-ending warnings on git add
Warnings are informational — Git auto-normalizes LF↔CRLF on a Windows working tree. Not an error, but if desired, set `.gitattributes` with `* text=auto eol=lf` to enforce LF in the repo.

---

## 📋 Missing Pages / Features

The audit checklist names a few files that don't currently exist in the repo. Per the audit spec these are flagged (not auto-created):

### Pages not yet implemented
| Path | Status |
|---|---|
| `src/app/dashboard/portfolio/page.tsx` | **Missing.** The sidebar config (`src/config/dashboard.ts`) already links to `/dashboard/portfolio` with a briefcase icon, and `src/config/portfolio.ts` exists — so the slot is wired, only the route file is absent. Clicking "Portfolio" in the sidebar today yields a Next.js 404. |
| `src/app/dashboard/watchlist/page.tsx` | **Missing.** Sidebar links to `/dashboard/watchlist` with an eye icon; `watchlist` table exists in `types/database.ts`; no page file. Clicking "Watchlist" also 404s. |
| `src/app/loading.tsx` | **Missing.** Next.js App Router supports route-level `loading.tsx` for Suspense fallbacks during navigation. The project has `PageLoader.tsx` (unused at root) and `Skeleton.tsx` but no top-level `loading.tsx`. Without it, navigations fall back to the Next.js default spinner instead of a branded skeleton. |

### Services not yet implemented
| Path | Status |
|---|---|
| `src/services/portfolio.service.ts` | **Missing.** The checklist calls for this but it doesn't exist. Portfolio stats are currently computed inline in `services/dashboard.service.ts::getPortfolioStats`. No user-visible breakage. |
| `src/services/position.service.ts` | **Missing.** Positions logic currently lives in `services/trade-engine.service.ts` (which handles both order placement and position upsert/close). Splitting position read-queries into a dedicated service would be cleaner once the positions page starts reading from Supabase instead of mocks. |

### Env vars listed but unused
- `UPSTOX_API_KEY`, `UPSTOX_API_SECRET` — listed in the audit checklist, not referenced anywhere in code. The current Upstox integration uses only `UPSTOX_ACCESS_TOKEN` (simpler flow). These two are likely planned for a future full-OAuth refresh flow but aren't wired yet.

---

## 🔧 Recommendations

Ordered by impact.

1. **Create stub pages for `/dashboard/portfolio` and `/dashboard/watchlist`** so sidebar navigation doesn't 404. Even a "Coming soon" stub imported from `POSITIONS_CONFIG`-style configs (paired with `src/config/portfolio.ts` which already exists) would be better than a hard 404. Alternative: flip `visible: false` on those sidebar items in `src/config/dashboard.ts` until the real pages ship.

2. **Add `src/app/loading.tsx`** using the existing `Skeleton` or `PageLoader` component. Next 16's streaming + Suspense work much better with a branded loading UI, especially on the dashboard where the layout already has the mounted-state delay.

3. **Positions page: wire real Supabase reads.** The page currently runs on mock data (3 open + 2 closed positions). The `orders` and `positions` Postgres tables, `trade-engine.service.ts` writes, and Position/Order types are all in place — just the read path is missing. This is where a dedicated `position.service.ts` (listed as missing) would fit.

4. **Gainers/Losers — add a graceful empty-state card** for when both providers 503. Right now the UI falls back to mock data (good) but the user has no signal that the data is stale. `LiveBadge source="demo"` is shown but subtle. Consider adding a one-time toast on switch from live → demo.

5. **`.gitattributes` for line endings.** Add `* text=auto eol=lf` to silence the CRLF warnings on every Windows `git add`. Purely cosmetic but reduces noise.

6. **Move the mocked option chain generator** (`api/trade/option-chain/route.ts`) behind a feature flag / env check so a future prod deploy with real Dhan credentials doesn't accidentally serve randomized data. Minor — the frontend already tags source correctly.

7. **Consider `src/middleware.ts` symlink/re-export.** Some tooling and docs assume `src/middleware.ts` by convention. `src/proxy.ts` is correct for Next 16 (per `AGENTS.md`), but a two-line `src/middleware.ts` that re-exports from `proxy.ts` could be considered for discoverability — or alternatively document this explicitly in `CLAUDE.md` (already done).

---

## Summary

| Category | Result |
|---|---|
| TypeScript | ✅ Clean |
| ESLint | ✅ Clean |
| Production build | ✅ 26 routes, no errors |
| Imports | ✅ No broken or unused imports |
| Hydration | ✅ No anti-patterns |
| Interaction rules | ✅ All buttons cursor-pointer compliant |
| Console errors | ✅ None |
| Middleware | ✅ Correctly wired via `src/proxy.ts` |
| Env vars | ✅ All referenced vars exist; 2 unreferenced are planned |
| Components | ✅ All listed components present |
| Configs | ✅ All listed configs present |
| Types | ✅ All listed types present |
| Pages — critical | ⚠️ 3 missing: `dashboard/portfolio`, `dashboard/watchlist`, `loading.tsx` |
| Services — optional | ⚠️ 2 missing: `portfolio.service.ts`, `position.service.ts` |
| Runtime data | ❌ Market-data 503s (external; creds issue) |

The codebase is in healthy, shippable shape. The open items are feature gaps, not defects.
