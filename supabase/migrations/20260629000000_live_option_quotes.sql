-- ============================================================================
-- TradeShala — live option streaming (WebSocket feed for the trade page)
-- ----------------------------------------------------------------------------
-- Two tables, both written ONLY by the service role (the always-on
-- scripts/upstox-ws.mjs worker) and read by authenticated browsers:
--
--  • live_option_subscriptions — a registry of which option contracts a browser
--    is currently viewing. The trade page upserts the visible ATM±N strikes
--    (via POST /api/trade/option-stream); the worker streams exactly the active
--    set (requested in the last ~30s) and drops the rest. This is how "stream
--    the viewed index's window" works without a browser→worker socket.
--
--  • live_option_quotes — the streamed LTP per option contract, keyed by the
--    Upstox instrument_key. Fanned out to the trade page over Supabase Realtime
--    (useLiveOptionQuotes), which overlays it onto the REST-fetched chain so
--    premiums tick ~1s instead of the old 5s poll.
--
-- Paste into: Supabase Dashboard → SQL Editor (idempotent, safe to re-run).
-- ============================================================================

create table if not exists public.live_option_quotes (
  instrument_key text primary key,        -- e.g. "NSE_FO|54321"
  symbol         text not null,           -- underlying display symbol, e.g. "NIFTY"
  expiry         text not null,           -- YYYY-MM-DD
  strike         numeric not null,
  option_type    text not null check (option_type in ('CE', 'PE')),
  ltp            numeric not null default 0,
  prev_close     numeric not null default 0,
  change         numeric not null default 0,
  change_percent numeric not null default 0,
  ts             timestamptz,
  updated_at     timestamptz not null default now()
);

create table if not exists public.live_option_subscriptions (
  instrument_key text primary key,
  symbol         text not null,
  expiry         text not null,
  strike         numeric not null,
  option_type    text not null check (option_type in ('CE', 'PE')),
  requested_at   timestamptz not null default now()
);

create index if not exists live_option_subscriptions_requested_idx
  on public.live_option_subscriptions (requested_at desc);

-- Realtime fan-out for the streamed quotes (subscriptions are server-internal).
-- The feed is upsert-driven, so after the first tick every change is an UPDATE.
-- Supabase only delivers UPDATE events when the table has REPLICA IDENTITY FULL
-- (same fix live_quotes needed) — without it the browser sees no ticks and the
-- UI falls back to its slow poll.
alter table public.live_option_quotes replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_option_quotes'
  ) then
    alter publication supabase_realtime add table public.live_option_quotes;
  end if;
end$$;

-- RLS: enabled. Authenticated read on quotes; both tables are written only by
-- the service role (worker + the option-stream route), which bypasses RLS.
alter table public.live_option_quotes enable row level security;
alter table public.live_option_subscriptions enable row level security;

drop policy if exists "loq_select_authenticated" on public.live_option_quotes;
create policy "loq_select_authenticated" on public.live_option_quotes
  for select to authenticated using (true);
