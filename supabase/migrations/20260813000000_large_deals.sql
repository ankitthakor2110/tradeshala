-- ============================================================================
-- TradeShala — large_deals: durable snapshot of NSE bulk/block/short deals
-- ============================================================================
-- NSE gates its large-deals API behind a homepage cookie AND blocks datacenter
-- IPs (e.g. Vercel), so fetching it live from the serverless route is unreliable
-- in production. This table decouples READ from FETCH: a standalone writer that
-- runs where NSE is reachable (scripts/nse-largedeals.mjs, service-role key)
-- replaces the snapshot here, and the /api/market-data/large-deals route reads
-- this table first (falling back to an in-process live fetch for local dev).
--
-- Shared market data — no user_id. Like live_quotes, RLS stays ENABLED with an
-- authenticated-read policy; only the server (service role) writes.
--
-- Paste into: Supabase Dashboard -> SQL Editor (idempotent, safe to re-run).
-- ============================================================================

create table if not exists public.large_deals (
  id          bigint generated always as identity primary key,
  deal_type   text not null check (deal_type in ('bulk', 'block', 'short')),
  symbol      text not null,
  name        text not null default '',
  client_name text not null default '',
  side        text check (side in ('BUY', 'SELL')), -- nullable (short deals have no side)
  qty         numeric not null default 0,
  watp        numeric,                               -- weighted-avg trade price; nullable
  deal_date   text not null default '',              -- NSE display date, e.g. "07-Aug-2026"
  as_on       text,                                  -- NSE as_on_date for the batch
  fetched_at  timestamptz not null default now()
);

-- Cross-tag lookups on the screener join by symbol.
create index if not exists large_deals_symbol_idx on public.large_deals (symbol);

-- RLS: enabled, authenticated read only. The writer uses the service role, which
-- bypasses RLS entirely — so no insert/update/delete policy is defined or wanted.
alter table public.large_deals enable row level security;

drop policy if exists "ld_select_authenticated" on public.large_deals;
create policy "ld_select_authenticated" on public.large_deals
  for select to authenticated using (true);
