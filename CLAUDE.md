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
- **ESLint 9** flat config format (`eslint.config.mjs`)

## Architecture

- App Router only — all routes live under `src/app/`
- Path alias: `@/*` maps to `./src/*`
- Root layout (`src/app/layout.tsx`) loads Geist Sans and Geist Mono fonts via `next/font/google`
- Global styles in `src/app/globals.css` with CSS custom properties for theming and dark mode via `prefers-color-scheme`
- No API routes, database, auth, or state management configured yet — this is an early-stage project

## Important Notes

- Next.js 16 has breaking changes from earlier versions. Always check `node_modules/next/dist/docs/` for up-to-date API guides before writing Next.js code.
- Tailwind v4 config is done via CSS (`globals.css`), not `tailwind.config.js`.
