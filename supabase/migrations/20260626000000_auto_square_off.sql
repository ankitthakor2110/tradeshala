-- ============================================================================
-- TradeShala — per-user auto-square-off preference
-- ============================================================================
-- When true, the server-side GTT pass (runGttOnce, inside the snapshot flow)
-- closes ALL of the user's open positions after the square-off cutoff
-- (POSITIONS_CONFIG.squareOff, 15:20 IST) — so square-off fires even when no
-- browser tab is open (the client toggle only worked while the page was open).
--
-- Safe to re-run. Paste into the Supabase SQL Editor.
-- ============================================================================
alter table public.profiles
  add column if not exists auto_square_off boolean not null default false;
