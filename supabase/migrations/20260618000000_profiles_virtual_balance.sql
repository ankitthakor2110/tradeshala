-- ============================================================================
-- TradeShala — add missing profiles.virtual_balance column
-- ============================================================================
-- The app (dashboard stats, trade engine, trade screen) and the Profile type
-- expect profiles.virtual_balance — the user's simulated cash — but the
-- hand-created profiles table is missing it, causing:
--   "column profiles.virtual_balance does not exist"
--
-- This adds the column with the documented ₹10,00,000 starting balance. The
-- NOT NULL DEFAULT backfills every existing row atomically, so no separate
-- UPDATE is needed (and re-running won't reset a player who has spent down).
-- Idempotent and safe to re-run.
--
-- Paste into: Supabase Dashboard -> SQL Editor.
-- ============================================================================

alter table public.profiles
  add column if not exists virtual_balance numeric not null default 1000000;
