-- ============================================================================
-- TradeShala — short/writing support: position direction + blocked margin
-- ============================================================================
-- Adds the two columns the trade engine needs to represent SELL-to-open (short)
-- option positions:
--   * direction       LONG (bought) | SHORT (written/sold-to-open)
--   * margin_blocked   cash held against a short while it's open; released on
--                      buy-to-close. Net cash effect of a short over its life is
--                      just realized P&L (margin nets out), so virtual_balance
--                      stays consistent.
--
-- Safe to re-run: add-column-if-not-exists, and existing rows backfill to LONG.
--
-- Paste into: Supabase Dashboard -> SQL Editor.
-- ============================================================================

alter table public.positions
  add column if not exists direction text not null default 'LONG',
  add column if not exists margin_blocked numeric not null default 0;

-- Constrain direction to the two valid values (drop-and-recreate so re-runs are
-- idempotent even if an older/looser constraint exists).
alter table public.positions
  drop constraint if exists positions_direction_check;
alter table public.positions
  add constraint positions_direction_check check (direction in ('LONG', 'SHORT'));

-- Any rows created before this migration were long-only by construction.
update public.positions set direction = 'LONG' where direction is null;
