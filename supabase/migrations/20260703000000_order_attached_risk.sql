-- ============================================================================
-- TradeShala — attached risk levels on pending orders
-- ============================================================================
-- Lets a LIMIT / SL / SL-M *entry* order carry the stop-loss / target the user
-- set at placement time. The `orders` row holds these until the order fills;
-- the server-side pending-order fill engine (src/lib/trade/pending-orders.ts)
-- copies them onto the new `positions` row it opens, so GTT then manages them.
-- MARKET orders fill immediately and write risk straight to the position, so
-- these columns stay null for them.
-- Nullable, so safe on existing rows. Idempotent.
--
-- Paste into: Supabase Dashboard -> SQL Editor.
-- ============================================================================

alter table public.orders
  add column if not exists attached_stop_loss numeric,
  add column if not exists attached_target    numeric;
