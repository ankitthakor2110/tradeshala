-- ============================================================================
-- TradeShala — TradingView webhook paper-trading ledger
-- ============================================================================
-- A SHARED (not per-user) paper-trading ledger fed by TradingView strategy
-- alerts hitting POST /api/webhook/tradingview. TradingView is the brain; this
-- app is the ledger + dashboard. PAPER TRADING ONLY — no broker orders.
--
-- Three tables, deliberately kept separate from the per-user trade engine
-- (orders/positions) so the simple directional points×lot model here never
-- collides with the option-contract engine:
--   1. tv_webhook_logs — every raw body received, for debugging/audit.
--   2. tv_positions    — currently OPEN positions (one per strategy+symbol).
--   3. tv_trades       — CLOSED trades with realized P&L.
--
-- Ownership: rows are NOT keyed by user_id. The webhook can't authenticate a
-- user (TradingView sends only a shared secret), so writes go through the
-- service-role admin client (RLS-bypassing), exactly like the live_quotes
-- snapshot writer. Any authenticated user can READ the ledger; nobody writes
-- via RLS (the admin client bypasses it, and the reset route is admin-gated).
--
-- Safe to re-run (create-if-not-exists / add-column). Paste into the Supabase
-- SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------

-- Raw inbound webhooks. Written BEFORE processing so failures are debuggable.
create table if not exists public.tv_webhook_logs (
  id           uuid primary key default gen_random_uuid(),
  received_at  timestamptz not null default now(),
  content_type text,
  source_ip    text,
  raw_body     text,
  parsed_json  jsonb,
  dedupe_key   text,
  -- received  = logged, not yet processed
  -- processed = applied to the ledger (opened/closed/reversed/no-op)
  -- rejected  = auth/validation/duplicate failure (see error)
  status       text not null default 'received'
                 check (status in ('received', 'processed', 'rejected')),
  error        text
);

-- Open positions: at most one per (strategy, symbol). A row exists here ONLY
-- while the position is open; on exit it is moved to tv_trades and deleted.
create table if not exists public.tv_positions (
  id           uuid primary key default gen_random_uuid(),
  strategy     text not null,
  symbol       text not null,
  side         text not null check (side in ('long', 'short')),
  option_type  text check (option_type in ('CALL', 'PUT')),
  timeframe    text,
  entry_price  numeric not null,
  sl           numeric,
  tp           numeric,
  qty          numeric not null default 1,
  opened_at    timestamptz not null default now(),
  status       text not null default 'open' check (status in ('open')),
  unique (strategy, symbol)
);

-- Closed trades: realized directional P&L (points × lot − costs).
create table if not exists public.tv_trades (
  id               uuid primary key default gen_random_uuid(),
  strategy         text not null,
  symbol           text not null,
  side             text not null check (side in ('long', 'short')),
  option_type      text check (option_type in ('CALL', 'PUT')),
  entry_price      numeric not null,
  exit_price       numeric not null,
  qty              numeric not null,
  gross            numeric not null,   -- (long: exit-entry | short: entry-exit) * qty * POINT_VALUE
  cost             numeric not null,   -- COST_PER_ORDER * 2 (entry + exit)
  net              numeric not null,   -- gross - cost
  reason           text not null check (reason in ('tp', 'sl', 'manual', 'reverse')),
  opened_at        timestamptz not null,
  closed_at        timestamptz not null default now(),
  duration_seconds numeric
);

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------
create index if not exists tv_positions_lookup_idx on public.tv_positions(strategy, symbol, status);
create index if not exists tv_trades_lookup_idx     on public.tv_trades(strategy, symbol);
create index if not exists tv_trades_closed_idx      on public.tv_trades(closed_at);
create index if not exists tv_webhook_logs_dedupe_idx on public.tv_webhook_logs(dedupe_key, received_at);
create index if not exists tv_webhook_logs_received_idx on public.tv_webhook_logs(received_at desc);

-- ----------------------------------------------------------------------------
-- 3. Row Level Security
-- Reads: any authenticated user. Writes: service-role only (bypasses RLS); no
-- insert/update/delete policies are defined, so authenticated clients cannot
-- mutate the ledger directly — the webhook + reset routes use the admin client.
-- ----------------------------------------------------------------------------
alter table public.tv_webhook_logs enable row level security;
alter table public.tv_positions    enable row level security;
alter table public.tv_trades        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tv_webhook_logs', 'tv_positions', 'tv_trades'] loop
    execute format('drop policy if exists "%1$s_select_auth" on public.%1$s', t);
    execute format(
      'create policy "%1$s_select_auth" on public.%1$s for select using (auth.role() = ''authenticated'')', t);
  end loop;
end$$;
