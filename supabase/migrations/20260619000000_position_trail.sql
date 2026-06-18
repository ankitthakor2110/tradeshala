-- ============================================================================
-- TradeShala — trailing stop-loss distance per position
-- ============================================================================
-- trail_amount: price distance below the running peak. When LTP falls to
-- (peak - trail_amount), the client-side monitor auto-closes the position.
-- Nullable, safe on existing rows, idempotent.
--
-- Paste into: Supabase Dashboard -> SQL Editor.
-- ============================================================================

alter table public.positions
  add column if not exists trail_amount numeric;
