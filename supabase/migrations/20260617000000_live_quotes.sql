-- ============================================================================
-- TradeShala — live_quotes: shared real-time price table
-- ============================================================================
-- Populated by the scheduled snapshot writer (/api/market-data/snapshot) using
-- the service-role key (bypasses RLS). Fanned out to browsers over Supabase
-- Realtime, so the frontend updates with no client-side polling.
--
-- There is no user_id: this is shared market data, identical for every user.
-- Like market_data_cache, RLS stays ENABLED with an authenticated-read policy;
-- only the server (service role) writes.
--
-- Paste into: Supabase Dashboard -> SQL Editor (idempotent, safe to re-run).
-- ============================================================================

create table if not exists public.live_quotes (
  symbol         text primary key,            -- display symbol the UI subscribes by, e.g. "NIFTY 50", "RELIANCE"
  exchange       text not null default 'NSE',
  ltp            numeric not null default 0,  -- last traded price
  prev_close     numeric not null default 0,
  change         numeric not null default 0,
  change_percent numeric not null default 0,
  volume         bigint  not null default 0,
  ts             timestamptz,                 -- provider timestamp (when the quote was sourced)
  updated_at     timestamptz not null default now()
);

-- Realtime fan-out: emit row changes on the supabase_realtime publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_quotes'
  ) then
    alter publication supabase_realtime add table public.live_quotes;
  end if;
end$$;

-- RLS: enabled, authenticated read only. Writes come from the service role,
-- which bypasses RLS entirely (no write policy needed or wanted).
alter table public.live_quotes enable row level security;

drop policy if exists "lq_select_authenticated" on public.live_quotes;
create policy "lq_select_authenticated" on public.live_quotes
  for select to authenticated using (true);
