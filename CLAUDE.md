# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Build & Dev Commands

- `npm run dev` — Start dev server (Next.js)
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run lint` — Run ESLint (flat config, Next.js core-web-vitals + TypeScript)

## Tech Stack

- **Next.js 16.2.1** with App Router (`src/app/`)
- **React 19** with TypeScript (strict mode)
- **Tailwind CSS v4** via PostCSS plugin (`@tailwindcss/postcss`) — uses `@import "tailwindcss"` syntax, not the v3 `@tailwind` directives
- **Supabase** for auth and database (`@supabase/ssr` + `@supabase/supabase-js`)
- **Recharts** for dashboard sparkline charts
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
- `src/config/admin.ts` — admin email gate + `isAdmin(email)` helper; lists admin-restricted pages

### Supabase Integration

- **Client-side:** `src/lib/supabase/client.ts` — browser client via `createBrowserClient`
- **Server-side:** `src/lib/supabase/server.ts` — server client via `createServerClient` (uses `cookies()`)
- **Middleware:** `src/proxy.ts` exports the middleware function; calls `src/lib/supabase/middleware.ts` to refresh sessions, protect routes (`/dashboard`, `/portfolio`, `/trades`, `/watchlist` redirect to `/login`), and gate admin-only routes (`/connection-status`) on server-side `ADMIN_EMAIL` env match (non-admins are bounced to `/dashboard?error=unauthorized`)
- **Env vars required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_EMAIL` (server) and `NEXT_PUBLIC_ADMIN_EMAIL` (client, used by `useAdmin` hook) — keep them equal. Broker/market-data keys (e.g. `DHAN_*`, `UPSTOX_*`) live server-side only. See `.env.local.example`.
- **Database types:** `src/types/database.ts` — typed `Database` interface for tables: `profiles`, `portfolios`, `trades`, `watchlist`, `holdings`, `broker_connections`. The `orders` and `positions` tables exist in the DB (used by the trade engine) but are typed inline via `Order` / `Position` interfaces rather than listed in the `Database` schema — cast inserts with `as never` when writing to them (see `trade-engine.service.ts`).

### API Routes (`src/app/api/`)

All provider/broker I/O and any access to server-only env vars must happen in route handlers — never call providers directly from client components. Existing routes:
- `api/market-data/{indices,quote,gainers-losers,search,health}` — read-only market data
- `api/trade/{expiries,option-chain}` — derivatives data for the trade simulator
- `api/broker/*` — broker OAuth / connection flows (Upstox, Zerodha)
- `api/admin/env-status` — admin-only diagnostics, consumed by `/connection-status`

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
- `src/services/trade-engine.service.ts` — order validation, fill simulation (slippage + brokerage from `TRADE_CONFIG.simulation`), position upsert/close, P&L math. Writes to `orders` + `positions` and calls the Postgres RPCs `deduct_virtual_cash` / `add_virtual_cash` to move the user's `virtual_balance`. MARKET orders fill instantly; LIMIT/SL/SL-M stay `PENDING` until price condition is met.

### Admin Gating

Two layers, both required:
1. **Server (middleware):** `ADMIN_EMAIL` env check in `src/lib/supabase/middleware.ts` — the security boundary.
2. **Client (`src/hooks/useAdmin.ts` + `src/config/admin.ts`):** `NEXT_PUBLIC_ADMIN_EMAIL` — used only to hide/show UI (e.g. the "Connection Status" sidebar item). Never rely on this for authorization.

### Type System

Types are split by domain under `src/types/`:
- `auth.ts` — form data interfaces, `ValidationResult`, `PasswordStrength`
- `database.ts` — Supabase row types (`Profile`, `Portfolio`, `Trade`, `WatchlistItem`) and the `Database` schema type
- `landing.ts` — landing page config types

### Shared Utilities

- `src/utils/validation.ts` — email, password, full name validators (uses rules from `authConfig`)
- `src/utils/colors.ts` — P&L color helpers (`getPnLColor`, `getPnLBgColor`, `formatPnL`)
- `src/utils/format.ts` — `timeAgo` and `formatOI` (Cr/L/K compaction for Indian number formatting)
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
