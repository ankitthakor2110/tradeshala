-- ============================================================================
-- TradeShala — multi-target (scale-out) exits per position
-- ============================================================================
-- targets: JSON array of { price, qty } scale-out levels. The client monitor
-- partial-closes `qty` shares when LTP reaches each `price` (once per level).
-- Nullable, safe on existing rows, idempotent.
--
-- Paste into: Supabase Dashboard -> SQL Editor.
-- ============================================================================

alter table public.positions
  add column if not exists targets jsonb;
