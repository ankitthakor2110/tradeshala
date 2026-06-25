-- ============================================================================
-- TradeShala — server-side GTT + IV/OI history
-- ============================================================================
-- Two additions:
--   1. positions.trail_peak — server-side trailing-stop needs to persist the
--      ratcheted peak (long) / trough (short); the client kept this in memory.
--   2. iv_history — a daily series of ATM IV / PCR / OI / max-pain per
--      underlying+expiry, so the app can compute IV Rank / IV Percentile and
--      draw IV/OI-over-time. Written by the snapshot flow.
--
-- Safe to re-run (add-column / create-if-not-exists). Paste into the Supabase
-- SQL Editor.
-- ============================================================================

alter table public.positions
  add column if not exists trail_peak numeric;

create table if not exists public.iv_history (
  id            uuid primary key default gen_random_uuid(),
  symbol        text not null,
  expiry        date,
  captured_on   date not null,            -- one row per symbol+expiry+day
  atm_iv        numeric,
  pcr           numeric,
  total_ce_oi   numeric,
  total_pe_oi   numeric,
  max_pain      numeric,
  underlying    numeric,
  created_at    timestamptz not null default now(),
  unique (symbol, expiry, captured_on)
);

create index if not exists iv_history_symbol_idx on public.iv_history(symbol, captured_on);

-- RLS: history is non-sensitive market data, readable by any authenticated user;
-- only the service role (snapshot writer) inserts.
alter table public.iv_history enable row level security;

drop policy if exists "iv_history_select_all" on public.iv_history;
create policy "iv_history_select_all" on public.iv_history
  for select using (auth.role() = 'authenticated');
