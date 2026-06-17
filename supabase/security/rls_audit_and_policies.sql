-- ============================================================================
-- TradeShala — Row Level Security (RLS) audit + remediation
-- ============================================================================
-- RLS is the ONLY thing preventing one logged-in user from reading another
-- user's rows, because the app talks to Postgres with the public anon key
-- (browser) or anon key + user session (server routes). A service-role key is
-- never used, so RLS is always in force *if it is enabled on the table*.
--
-- Run the AUDIT section first (read-only) to see the current state, then run
-- the REMEDIATION section for any table that shows rls_enabled = false or has
-- no policies. Everything below is idempotent and safe to re-run.
--
-- Paste into: Supabase Dashboard -> SQL Editor.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. AUDIT (read-only) — which tables have RLS turned on?
-- ----------------------------------------------------------------------------
select
  n.nspname            as schema,
  c.relname            as table,
  c.relrowsecurity     as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- ----------------------------------------------------------------------------
-- 2. AUDIT (read-only) — list every existing policy
-- ----------------------------------------------------------------------------
select
  schemaname,
  tablename,
  policyname,
  cmd            as command,
  qual           as using_expr,
  with_check     as with_check_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- ============================================================================
-- REMEDIATION
-- ============================================================================
-- The tables below hold per-user data but were NOT in the documented policy
-- set (PROGRESS.md only covered profiles/portfolios/trades/watchlist).
-- broker_connections is the most sensitive: it holds live broker API keys,
-- secrets, and access tokens. Without RLS, any authenticated user could read
-- every other user's broker credentials via the public anon key.
--
-- NOTE: each of these tables is assumed to have a `user_id uuid` column that
-- references auth.users(id). If a column name differs, adjust before running.
-- ============================================================================

-- ---- broker_connections ----------------------------------------------------
alter table public.broker_connections enable row level security;

drop policy if exists "bc_select_own" on public.broker_connections;
create policy "bc_select_own" on public.broker_connections
  for select using (auth.uid() = user_id);

drop policy if exists "bc_insert_own" on public.broker_connections;
create policy "bc_insert_own" on public.broker_connections
  for insert with check (auth.uid() = user_id);

drop policy if exists "bc_update_own" on public.broker_connections;
create policy "bc_update_own" on public.broker_connections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "bc_delete_own" on public.broker_connections;
create policy "bc_delete_own" on public.broker_connections
  for delete using (auth.uid() = user_id);

-- ---- holdings ---------------------------------------------------------------
alter table public.holdings enable row level security;

drop policy if exists "holdings_select_own" on public.holdings;
create policy "holdings_select_own" on public.holdings
  for select using (auth.uid() = user_id);

drop policy if exists "holdings_insert_own" on public.holdings;
create policy "holdings_insert_own" on public.holdings
  for insert with check (auth.uid() = user_id);

drop policy if exists "holdings_update_own" on public.holdings;
create policy "holdings_update_own" on public.holdings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "holdings_delete_own" on public.holdings;
create policy "holdings_delete_own" on public.holdings
  for delete using (auth.uid() = user_id);

-- ---- orders -----------------------------------------------------------------
alter table public.orders enable row level security;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select using (auth.uid() = user_id);

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert with check (auth.uid() = user_id);

drop policy if exists "orders_update_own" on public.orders;
create policy "orders_update_own" on public.orders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "orders_delete_own" on public.orders;
create policy "orders_delete_own" on public.orders
  for delete using (auth.uid() = user_id);

-- ---- positions --------------------------------------------------------------
alter table public.positions enable row level security;

drop policy if exists "positions_select_own" on public.positions;
create policy "positions_select_own" on public.positions
  for select using (auth.uid() = user_id);

drop policy if exists "positions_insert_own" on public.positions;
create policy "positions_insert_own" on public.positions
  for insert with check (auth.uid() = user_id);

drop policy if exists "positions_update_own" on public.positions;
create policy "positions_update_own" on public.positions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "positions_delete_own" on public.positions;
create policy "positions_delete_own" on public.positions
  for delete using (auth.uid() = user_id);

-- ---- market_data_cache (shared, non-user data) -----------------------------
-- This table is a shared price cache with no user_id. It should be readable by
-- any authenticated user and writable by the server. It must still have RLS
-- ENABLED (otherwise the anon key exposes it broadly); the policy just allows
-- authenticated access rather than per-user scoping.
alter table public.market_data_cache enable row level security;

drop policy if exists "mdc_select_authenticated" on public.market_data_cache;
create policy "mdc_select_authenticated" on public.market_data_cache
  for select to authenticated using (true);

drop policy if exists "mdc_write_authenticated" on public.market_data_cache;
create policy "mdc_write_authenticated" on public.market_data_cache
  for all to authenticated using (true) with check (true);

-- ============================================================================
-- 3. RE-AUDIT — confirm every public table now reports rls_enabled = true
-- ============================================================================
select c.relname as table, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
