-- ============================================================================
-- TradeShala — per-position risk levels (SL / Target / Alert)
-- ============================================================================
-- Adds optional price levels attached to a position:
--   stop_loss / target  -> auto-close trigger levels (GTT-style)
--   alert_price         -> notify-only level
-- Nullable, so safe on existing rows. Idempotent.
--
-- Paste into: Supabase Dashboard -> SQL Editor.
-- ============================================================================

alter table public.positions
  add column if not exists stop_loss   numeric,
  add column if not exists target      numeric,
  add column if not exists alert_price numeric;
