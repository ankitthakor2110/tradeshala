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

### Supabase Integration

- **Client-side:** `src/lib/supabase/client.ts` — browser client via `createBrowserClient`
- **Server-side:** `src/lib/supabase/server.ts` — server client via `createServerClient` (uses `cookies()`)
- **Middleware:** `src/proxy.ts` exports the middleware function; calls `src/lib/supabase/middleware.ts` to refresh sessions and protect routes (`/dashboard`, `/portfolio`, `/trades`, `/watchlist` redirect to `/login` if unauthenticated)
- **Env vars required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.local.example`)
- **Database types:** `src/types/database.ts` — typed `Database` interface for tables: `profiles`, `portfolios`, `trades`, `watchlist`

### Service Layer

Business logic lives in `src/services/`, not in components:
- `src/services/auth.service.ts` — signUp, signIn, signOut, getCurrentUser, sendPasswordReset, resetPassword
- `src/services/dashboard.service.ts` — getMarketStatus (IST market hours), getGreeting, getPortfolioStats

### Type System

Types are split by domain under `src/types/`:
- `auth.ts` — form data interfaces, `ValidationResult`, `PasswordStrength`
- `database.ts` — Supabase row types (`Profile`, `Portfolio`, `Trade`, `WatchlistItem`) and the `Database` schema type
- `landing.ts` — landing page config types

### Shared Utilities

- `src/utils/validation.ts` — email, password, full name validators (uses rules from `authConfig`)
- `src/utils/colors.ts` — P&L color helpers (`getPnLColor`, `getPnLBgColor`, `formatPnL`)
- `src/styles/interactions.ts` — `INTERACTION_CLASSES` object with pre-built Tailwind class strings for buttons, links, cards, inputs
- `src/context/LoadingContext.tsx` — `LoadingProvider` / `useLoading` context for global loading state

## UI & Interaction Rules

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
