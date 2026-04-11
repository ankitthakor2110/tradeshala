# TradeShala — Project Progress Summary

## 📋 Project Overview

- **Project Name:** TradeShala
- **Description:** India's #1 virtual paper trading platform. Practice trading with virtual funds using real-time NSE/BSE data. 100% free and risk-free.
- **Tech Stack:** Next.js 16.2.1 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, Supabase (auth + DB), Recharts, ESLint 9
- **Repository:** github.com/ankitthakor2110/tradeshala
- **Deployment:** Vercel (auto-deploy from `main` branch)
- **Package Manager:** npm

## 🏗️ Project Structure

```
src/
├── app/                          # App Router pages and layouts
│   ├── layout.tsx                # Root layout (fonts, metadata)
│   ├── page.tsx                  # Landing page (/)
│   ├── globals.css               # Global styles + Tailwind v4 theme
│   ├── error.tsx                 # Global error boundary
│   ├── not-found.tsx             # 404 page
│   ├── login/
│   │   ├── page.tsx              # Login page wrapper (Suspense)
│   │   └── LoginForm.tsx         # Login form (client component)
│   ├── signup/
│   │   └── page.tsx              # Signup page
│   ├── forgot-password/
│   │   └── page.tsx              # Forgot password page
│   ├── reset-password/
│   │   └── page.tsx              # Reset password page
│   ├── dashboard/
│   │   ├── layout.tsx            # Dashboard layout (sidebar + navbar)
│   │   └── page.tsx              # Dashboard home page
│   ├── favicon.ico
│   ├── favicon-16x16.ico
│   └── logo.png
├── components/
│   ├── landing/                  # Landing page sections
│   │   ├── Navbar.tsx
│   │   ├── HeroSection.tsx
│   │   ├── StatsSection.tsx
│   │   ├── FeaturesSection.tsx
│   │   ├── HowItWorksSection.tsx
│   │   ├── TestimonialsSection.tsx  (built, currently commented out in page.tsx)
│   │   ├── CTASection.tsx
│   │   └── Footer.tsx
│   ├── dashboard/                # Dashboard components
│   │   ├── Sidebar.tsx
│   │   ├── DashboardNavbar.tsx
│   │   └── SidebarIcon.tsx
│   ├── legal/                    # Legal content components
│   │   ├── TermsContent.tsx
│   │   └── PrivacyContent.tsx
│   └── ui/                       # Reusable UI components
│       ├── BrandLogo.tsx
│       ├── ButtonLoader.tsx
│       ├── FormInput.tsx
│       ├── Modal.tsx
│       ├── PageLoader.tsx
│       └── ScrollToTop.tsx
├── config/                       # All user-facing strings and content
│   ├── landing.ts
│   ├── auth.ts
│   ├── dashboard.ts
│   └── legal.ts
├── context/
│   └── LoadingContext.tsx         # Global loading state provider
├── hooks/
│   └── useAuthRedirect.ts        # Auth-aware redirect hook
├── lib/
│   └── supabase/
│       ├── client.ts             # Browser Supabase client
│       ├── server.ts             # Server Supabase client
│       └── middleware.ts         # Session refresh + route protection
├── services/                     # Business logic layer
│   ├── auth.service.ts
│   └── dashboard.service.ts
├── styles/
│   └── interactions.ts           # INTERACTION_CLASSES for all interactive elements
├── types/                        # TypeScript interfaces by domain
│   ├── auth.ts
│   ├── database.ts
│   ├── landing.ts
│   └── legal.ts
├── utils/
│   ├── validation.ts             # Form validation functions
│   └── colors.ts                 # P&L color helpers
└── proxy.ts                      # Next.js middleware entry point
```

**Folder purposes:**

| Folder | Purpose |
|--------|---------|
| `app/` | All routes, layouts, and page components (App Router) |
| `components/` | Reusable UI components organized by feature area |
| `config/` | All hardcoded content, labels, strings, and mock data — components never hardcode copy |
| `context/` | React context providers |
| `hooks/` | Custom React hooks |
| `lib/supabase/` | Supabase client initialization (browser, server, middleware) |
| `services/` | Business logic and API calls |
| `styles/` | Shared Tailwind class string constants |
| `types/` | TypeScript interfaces organized by domain |
| `utils/` | Pure utility/helper functions |

## ✅ Completed Features

### 1. Project Setup

- Initialized with `create-next-app` (Next.js 16.2.1)
- TypeScript strict mode enabled
- Tailwind CSS v4 configured via PostCSS plugin (`@tailwindcss/postcss`)
- Custom theme tokens defined in `globals.css` `@theme inline` block (`--color-primary-400` through `--color-primary-700`)
- ESLint 9 flat config with `core-web-vitals` + TypeScript presets
- Path alias `@/*` mapped to `./src/*`
- Geist Sans and Geist Mono fonts loaded via `next/font/google`
- Vercel deployment configured with auto-deploy from `main`
- `.env.local.example` created for environment variable reference
- `CLAUDE.md` and `CLAUDE_RULES.md` added for AI-assisted development guidance
- `AGENTS.md` added with Next.js 16 breaking changes warning

### 2. Landing Page

**Sections built (7):**
- Navbar — fixed top navigation with brand logo and anchor links
- HeroSection — headline with gradient highlight, CTA buttons, feature badges
- StatsSection — 4 stat cards (Active Traders, Virtual Trades, User Satisfaction, Market Access)
- FeaturesSection — 6 feature cards with emoji icons (Real-Time Data, Virtual Portfolio, Analytics, Learn & Earn, Leaderboards, Smart Alerts)
- HowItWorksSection — 3-step process (Create Account, Get Virtual Funds, Start Trading)
- TestimonialsSection — 3 testimonial cards with ratings (built but currently commented out in `page.tsx`)
- CTASection — final call-to-action with signup button
- Footer — 3-column link groups + copyright

**Components:** `src/components/landing/` — Navbar, HeroSection, StatsSection, FeaturesSection, HowItWorksSection, TestimonialsSection, CTASection, Footer

**Config:** `src/config/landing.ts` — all landing page content including `siteConfig` (metadata) and `landingConfig` (all section content)

### 3. Authentication Pages

**Login page (`/login`):**
- Split layout: left panel (brand showcase with headlines, features, stats) + right panel (form)
- Email and password fields with validation
- "Remember me" checkbox
- "Forgot Password?" link
- Show/hide password toggle
- Loading state with spinner text
- Redirects to `/dashboard` on success
- Shows success banner when redirected from signup (`?signup=success`)
- Wrapped in `<Suspense>` for `useSearchParams()` compatibility

**Signup page (`/signup`):**
- Same split layout as login
- Fields: Full Name, Email, Password, Confirm Password
- "Agree to Terms & Conditions" checkbox (required)
- Terms & Privacy Policy modals open inline
- Redirects to `/login?signup=success` on success

**Forgot password page (`/forgot-password`):**
- Same split layout
- Single email field
- Sends Supabase password reset email
- Shows success confirmation with email address displayed
- "Back to Login" link

**Reset password page (`/reset-password`):**
- Centered layout with BrandLogo
- New password + confirm password fields
- Real-time password strength indicator (weak/medium/strong) with color-coded progress bar
- Show/hide password toggles on both fields
- Redirects to `/login` after 2 seconds on success

**Validation rules implemented (`src/utils/validation.ts`):**
- Email: required, valid format, blocked disposable domains
- Password: required, min 8 chars, at least 1 uppercase, 1 number, 1 special character
- Full name: required, min 2 chars, letters and spaces only
- Confirm password: required, must match password
- Agree to terms: required for signup

**Blocked email domains:** `yopmail.com`, `mailinator.com`, `dispostable.com`

### 4. Database & Backend

**Supabase integration:**
- Browser client: `src/lib/supabase/client.ts` using `createBrowserClient` from `@supabase/ssr`
- Server client: `src/lib/supabase/server.ts` using `createServerClient` with cookie handling
- Middleware: `src/proxy.ts` → `src/lib/supabase/middleware.ts` — refreshes auth sessions on every request and protects routes
- All clients typed with `Database` generic from `src/types/database.ts`

**Database tables (defined in `src/types/database.ts`):**

| Table | Columns |
|-------|---------|
| `profiles` | `id`, `email`, `full_name`, `avatar_url`, `virtual_balance`, `created_at`, `updated_at` |
| `portfolios` | `id`, `user_id`, `symbol`, `company_name`, `quantity`, `avg_buy_price`, `current_price`, `created_at`, `updated_at` |
| `trades` | `id`, `user_id`, `symbol`, `company_name`, `type` (buy/sell), `quantity`, `price`, `total_amount`, `created_at` |
| `watchlist` | `id`, `user_id`, `symbol`, `company_name`, `added_at` |

**Protected routes (middleware redirects to `/login` if unauthenticated):**
- `/dashboard`
- `/portfolio`
- `/trades`
- `/watchlist`

**RLS (Row Level Security) policies (configured in Supabase Dashboard):**

| Table | Policy | Rule |
|-------|--------|------|
| `profiles` | Users can read own profile | `SELECT` where `auth.uid() = id` |
| `profiles` | Users can update own profile | `UPDATE` where `auth.uid() = id` |
| `portfolios` | Users can read own holdings | `SELECT` where `auth.uid() = user_id` |
| `portfolios` | Users can insert own holdings | `INSERT` with check `auth.uid() = user_id` |
| `portfolios` | Users can update own holdings | `UPDATE` where `auth.uid() = user_id` |
| `portfolios` | Users can delete own holdings | `DELETE` where `auth.uid() = user_id` |
| `trades` | Users can read own trades | `SELECT` where `auth.uid() = user_id` |
| `trades` | Users can insert own trades | `INSERT` with check `auth.uid() = user_id` |
| `watchlist` | Users can read own watchlist | `SELECT` where `auth.uid() = user_id` |
| `watchlist` | Users can insert to own watchlist | `INSERT` with check `auth.uid() = user_id` |
| `watchlist` | Users can delete from own watchlist | `DELETE` where `auth.uid() = user_id` |

> All tables have RLS enabled. Every policy scopes data to the authenticated user via `auth.uid()`.

**Auth trigger (configured in Supabase Dashboard):**
- **`on_auth_user_created`** — a PostgreSQL trigger function that fires after a new user signs up via Supabase Auth. It automatically creates a row in the `profiles` table with:
  - `id` = the new user's `auth.uid()`
  - `email` = the user's email from auth metadata
  - `full_name` = extracted from `raw_user_meta_data->>'full_name'` (passed during `signUp()` in `auth.service.ts`)
  - `virtual_balance` = `1000000` (default starting balance of ₹10,00,000)
  - `created_at` / `updated_at` = `now()`

**Services created:**
- `auth.service.ts` — `signUp`, `signIn`, `signOut`, `getCurrentUser`, `sendPasswordReset`, `resetPassword`
- `dashboard.service.ts` — `getMarketStatus` (IST market hours check), `getGreeting` (time-based greeting), `getPortfolioStats` (fetches from Supabase or returns mock data)

### 5. Dashboard

**Layout:** `src/app/dashboard/layout.tsx` — client component with collapsible sidebar + top navbar

**Sidebar (`src/components/dashboard/Sidebar.tsx`):**
- Fixed left sidebar (240px wide)
- Mobile: slide-in overlay with backdrop
- Nav items: Dashboard, Portfolio, Trades, Watchlist (from `dashboardConfig.sidebar.items`)
- Active item highlighted with violet accent
- Settings link at bottom
- BrandLogo component at top

**Navbar (`src/components/dashboard/DashboardNavbar.tsx`):**
- Fixed top bar, offset for sidebar on desktop
- Dynamic page title based on current route
- Market status indicator (open/closed) — checks IST 9:15 AM to 3:30 PM, Mon-Fri
- Refreshes market status every 60 seconds
- Notification bell icon
- Profile dropdown with user initials, name, email, virtual cash display, logout button
- Click-outside-to-close behavior on dropdown

**Dashboard page (`src/app/dashboard/page.tsx`):**
- Time-based greeting with user's first name
- Market index cards (NIFTY 50, BANK NIFTY) with sparkline charts (Recharts)
- Portfolio summary: Virtual Cash, Portfolio Value, Total P&L, P&L %
- Top Gainers and Top Losers lists
- Uses mounted state pattern to prevent hydration errors

**Mock data used (in `src/config/dashboard.ts`):**
- 2 market indices with sparkline data arrays
- 5 top gainers and 5 top losers
- Default portfolio stats: Virtual Cash = 10,00,000, Portfolio Value = 0, P&L = 0

### 6. UI/UX Standards

**Color theme:**
- Primary accent: Violet/Purple (`violet-400` through `violet-700`)
- Custom CSS tokens: `--color-primary-400: #a78bfa`, `--color-primary-500: #8b5cf6`, `--color-primary-600: #7c3aed`, `--color-primary-700: #6d28d9`
- Background: Dark (`gray-950`, `gray-900`)
- Text: White (`text-white`) and gray variants

**Financial data colors:**
- Green (`text-green-400`, `bg-green-500/10`) — positive values, gainers, profit
- Red (`text-red-400`, `bg-red-500/10`) — negative values, losers, loss
- Gray (`text-gray-400`) — neutral/zero values

**Interaction standards (from `CLAUDE_RULES.md`):**
- Every button: `cursor-pointer`, `transition-all duration-200`, `active:scale-95`, hover state, disabled states
- Every link: `cursor-pointer`, `transition-colors duration-200`, hover color change
- Clickable cards: `hover:-translate-y-1`, `hover:border-violet-500/30`
- Form inputs: `focus:ring-2 focus:ring-violet-500/50`, `focus:border-violet-500`

**INTERACTION_CLASSES (`src/styles/interactions.ts`):**
- `primaryButton` — violet gradient with lift and shadow on hover
- `secondaryButton` — border outline with background change on hover
- `ghostButton` — no background, hover shows gray
- `dangerButton` — red with lift and shadow
- `navLink` — color transition to violet on hover
- `textLink` — violet with underline on hover
- `sidebarItem` / `sidebarItemActive` — sidebar nav styling
- `iconButton` — rounded full, scale on active
- `clickableCard` — lift + border highlight on hover
- `formInput` — focus ring styling
- `checkboxLabel` — cursor pointer with hover color
- `dropdownItem` — hover background with padding

**Loader system:**
- `LoadingContext` — global loading state via React context (`isLoading`, `loadingText`)
- `PageLoader` — full-screen overlay spinner (uses `useLoading` hook)
- `ButtonLoader` — inline spinning border animation for buttons

**Hydration rules:**
- `"use client"` on all interactive components
- Mounted state pattern for browser/time-dependent rendering
- No `typeof window` in JSX
- No `<a>` inside `<Link>`

### 7. Components Library

| Component | Location | Purpose |
|-----------|----------|---------|
| `BrandLogo` | `components/ui/BrandLogo.tsx` | Auth-aware brand link (logged in → `/dashboard`, not → `/`) |
| `ButtonLoader` | `components/ui/ButtonLoader.tsx` | Inline spinning loader for buttons |
| `FormInput` | `components/ui/FormInput.tsx` | Reusable form field with label, error display, password toggle |
| `Modal` | `components/ui/Modal.tsx` | Overlay modal with header, scrollable content, ESC to close |
| `PageLoader` | `components/ui/PageLoader.tsx` | Full-screen loading overlay (uses LoadingContext) |
| `ScrollToTop` | `components/ui/ScrollToTop.tsx` | Floating button, appears after 300px scroll, smooth scroll to top |
| `Sidebar` | `components/dashboard/Sidebar.tsx` | Dashboard sidebar with nav items, mobile slide-in |
| `DashboardNavbar` | `components/dashboard/DashboardNavbar.tsx` | Top bar with page title, market status, profile dropdown |
| `SidebarIcon` | `components/dashboard/SidebarIcon.tsx` | SVG icon renderer by name (grid, briefcase, activity, eye, settings) |
| `Navbar` | `components/landing/Navbar.tsx` | Landing page fixed navbar |
| `HeroSection` | `components/landing/HeroSection.tsx` | Landing hero with CTA buttons and badges |
| `StatsSection` | `components/landing/StatsSection.tsx` | Stat counter cards |
| `FeaturesSection` | `components/landing/FeaturesSection.tsx` | Feature grid with icons |
| `HowItWorksSection` | `components/landing/HowItWorksSection.tsx` | 3-step process section |
| `TestimonialsSection` | `components/landing/TestimonialsSection.tsx` | User testimonial cards |
| `CTASection` | `components/landing/CTASection.tsx` | Final call-to-action |
| `Footer` | `components/landing/Footer.tsx` | Multi-column footer |
| `TermsContent` | `components/legal/TermsContent.tsx` | Terms & Conditions content |
| `PrivacyContent` | `components/legal/PrivacyContent.tsx` | Privacy Policy content |

### 8. Configuration Files

| File | Purpose |
|------|---------|
| `src/config/landing.ts` | `siteConfig` (page metadata) + `landingConfig` (all landing page section content) |
| `src/config/auth.ts` | `authConfig` — login/signup/forgot/reset form labels, error messages, loading text, security text, blocked email domains, login panel branding |
| `src/config/dashboard.ts` | `dashboardConfig` — sidebar items, navbar titles, market hours (IST), greetings, mock indices/gainers/losers/stats, labels, currency symbol |
| `src/config/legal.ts` | `termsConfig` + `privacyConfig` — Terms & Conditions and Privacy Policy sections (last updated April 1, 2025) |

### 9. TypeScript Types

| File | Interfaces |
|------|-----------|
| `src/types/auth.ts` | `LoginFormData`, `SignupFormData`, `ForgotPasswordFormData`, `ResetPasswordFormData`, `PasswordStrength`, `ValidationResult` |
| `src/types/database.ts` | `Profile`, `Portfolio`, `Trade`, `WatchlistItem`, `IndexData`, `StockGainerLoser`, `DashboardStats`, `SidebarItem`, `Database` (Supabase typed schema) |
| `src/types/landing.ts` | `NavLink`, `CTAButton`, `Badge`, `HeroConfig`, `Stat`, `Feature`, `Step`, `Testimonial`, `CTASectionConfig`, `FooterLinkGroup`, `FooterConfig`, `LogoConfig`, `LandingConfig` |
| `src/types/legal.ts` | `LegalSection`, `LegalConfig`, `ModalProps` |

### 10. Utility Functions

| File | Functions |
|------|-----------|
| `src/utils/validation.ts` | `validateEmail(email)` — format + blocked domain check; `validatePassword(password)` — length, uppercase, number, special char; `validateFullName(name)` — length + letters only |
| `src/utils/colors.ts` | `getPnLColor(value)` — returns green/red/gray text class; `getPnLBgColor(value)` — returns bg + text + border classes; `formatPnL(value, currency)` — formats with +/- sign and INR locale |
| `src/hooks/useAuthRedirect.ts` | `useAuthRedirect()` — returns `{ mounted, isLoggedIn, homeUrl }` based on Supabase session |

### 11. Deployment

- **Platform:** Vercel
- **Auto-deploy:** Pushes to `main` branch trigger automatic deployment
- **Environment variables:** Must be set in Vercel project settings (see Environment Variables section below)
- **Previous fix:** Resolved Vercel internal server error (commit `24b9365`)

## 🔄 Git Commit History

```
0468ab4 Docs: Add project progress summary and auth-aware BrandLogo
24b9365 Fix: Resolve Vercel internal server error
3b9c7d1 Connected to supabase
71f11fd Fixed navbar
038cc28 Prepared initial design
1b1e8d8 Refactor: configurable and scalable landing page
7a4b1de Initial commit - TradeShala Next.js app
1dcd869 Initial commit from Create Next App
```

## ⚠️ Known Issues / Tech Debt

- **TestimonialsSection commented out** — the component is built (`src/components/landing/TestimonialsSection.tsx`) but commented out in `src/app/page.tsx` (lines 7 and 20)
- **Dashboard uses mock data** — market indices, gainers/losers, and portfolio stats are hardcoded in `src/config/dashboard.ts`; `getPortfolioStats` falls back to mock data if Supabase query fails
- **`suppressHydrationWarning`** on `<html>` and `<body>` in root layout, and on sparkline chart container in dashboard
- **No tests** — no unit tests, integration tests, or E2E tests exist in the project
- **No loading states on auth pages** — pages use inline `isLoading` state but don't use the global `LoadingContext`/`PageLoader`
- **`proxy.ts` naming** — Next.js middleware is exported from `src/proxy.ts` (function named `proxy` instead of the conventional `middleware`)
- **Logo config commented out** — `landingConfig` has `logo` property commented out, using text-based brand rendering instead

## 🚀 Pending Features

- **Portfolio page** (`/dashboard/portfolio`) — empty, no page component exists
- **Trades page** (`/dashboard/trades`) — empty, no page component exists
- **Watchlist page** (`/dashboard/watchlist`) — empty, no page component exists
- **Settings page** (`/dashboard/settings`) — empty, no page component exists
- **User profile page** — no dedicated profile view
- **Real market data integration** — currently all mock data
- **Google OAuth** — only email/password auth implemented
- **Leaderboards & Contests** — listed as a feature on landing page but not implemented
- **Smart Alerts** — listed as a feature on landing page but not implemented
- **Trading functionality** — buy/sell flow not implemented
- **Search** — no stock search functionality

## 📦 Dependencies

**Production:**
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.2.1 | React framework (App Router) |
| `react` | 19.2.4 | UI library |
| `react-dom` | 19.2.4 | React DOM renderer |
| `@supabase/ssr` | ^0.10.0 | Supabase SSR helpers (cookie-based auth) |
| `@supabase/supabase-js` | ^2.101.1 | Supabase JavaScript client |
| `recharts` | ^3.8.1 | Chart library (sparkline charts in dashboard) |

**Dev Dependencies:**
| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5 | TypeScript compiler |
| `@types/node` | ^20 | Node.js type definitions |
| `@types/react` | ^19 | React type definitions |
| `@types/react-dom` | ^19 | React DOM type definitions |
| `tailwindcss` | ^4 | Utility-first CSS framework |
| `@tailwindcss/postcss` | ^4 | Tailwind CSS PostCSS plugin |
| `eslint` | ^9 | Linter |
| `eslint-config-next` | 16.2.1 | Next.js ESLint config |

## 🔐 Environment Variables

| Variable | Description | Where to find |
|----------|-------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key | Supabase Dashboard → Project Settings → API → `anon` `public` key |

These must be set in:
- `.env.local` for local development
- Vercel project settings for production deployment

## 📝 Development Commands

```bash
npm run dev       # Start dev server at http://localhost:3000
npm run build     # Production build (also catches TypeScript errors)
npm run lint      # Run ESLint
npm run start     # Start production server (after build)
```

## 🎨 Design System

**Color palette:**
- Primary: Violet (`#a78bfa` → `#6d28d9`)
- Background: Dark grays (`gray-950: #0a0a0a`, `gray-900`, `gray-800`)
- Text: White + gray variants
- Success/Profit: Green (`green-400`, `green-500`)
- Error/Loss: Red (`red-400`, `red-500`)
- Neutral: Gray (`gray-400`)

**Typography:**
- Font family: Geist Sans (primary), Geist Mono (code)
- Loaded via `next/font/google` with CSS variables `--font-geist-sans` and `--font-geist-mono`

**Component styling patterns:**
- All interactive classes centralized in `INTERACTION_CLASSES` (`src/styles/interactions.ts`)
- Components import and spread these class strings — never write raw interaction styles inline
- Dark-first design: `bg-gray-950` base, `bg-gray-900` for cards, `bg-gray-800` for inputs
- Border styling: `border-gray-800` for subtle dividers, `border-violet-500/20` for active/accent

**Tailwind v4 configuration:**
- Config via CSS, not `tailwind.config.js`
- `@import "tailwindcss"` in `globals.css`
- Custom theme tokens in `@theme inline` block
- Custom CSS animations: `fadeIn`, `slideUp`
- Custom utility class: `.dot-grid` (decorative dot pattern on auth pages)
