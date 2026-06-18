-- ============================================================================
-- TradeShala — baseline core schema (drift-safe)
-- ============================================================================
-- Reproducible definition of the core tables, RLS policies, RPCs and the
-- signup trigger that the app depends on. Until now the schema was created by
-- hand in the Supabase dashboard, which caused drift (e.g. profiles was missing
-- both virtual_balance and updated_at).
--
-- Column types/names mirror src/types/database.ts (Profile, Portfolio, Trade,
-- WatchlistItem, Holding, Order, Position).
--
-- Works on BOTH fresh and drifted databases and is safe to re-run:
--   1. `create table if not exists` builds missing tables.
--   2. `add column if not exists` heals existing tables that are missing
--      columns (added nullable / with-default so it never fails on populated
--      tables; existing columns are left untouched, keeping their constraints).
--   3. Functions/triggers are created AFTER the columns they reference exist.
--
-- Paste into: Supabase Dashboard -> SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Shared helper
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. Tables (fresh-install definitions with full constraints)
-- ============================================================================
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text not null default '',
  avatar_url      text,
  phone_number    text,
  virtual_balance numeric not null default 1000000,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

create table if not exists public.portfolios (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  symbol        text not null,
  company_name  text not null,
  quantity      numeric not null,
  avg_buy_price numeric not null,
  current_price numeric not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.trades (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  symbol       text not null,
  company_name text not null,
  type         text not null check (type in ('buy', 'sell')),
  quantity     numeric not null,
  price        numeric not null,
  total_amount numeric not null,
  created_at   timestamptz not null default now()
);

create table if not exists public.watchlist (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  symbol       text not null,
  company_name text not null,
  added_at     timestamptz not null default now(),
  unique (user_id, symbol)
);

create table if not exists public.holdings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  symbol            text not null,
  company_name      text not null,
  quantity          numeric not null,
  average_buy_price numeric not null,
  total_invested    numeric not null,
  current_price     numeric,
  current_value     numeric,
  pnl               numeric not null default 0,
  pnl_percent       numeric not null default 0,
  exchange          text not null default 'NSE',
  sector            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.orders (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  symbol             text not null,
  exchange           text not null,
  instrument_type    text not null check (instrument_type in ('EQ', 'CE', 'PE', 'FUT')),
  company_name       text,
  option_type        text check (option_type in ('CE', 'PE')),
  strike_price       numeric,
  expiry_date        date,
  lot_size           integer not null default 1,
  order_type         text not null check (order_type in ('MARKET', 'LIMIT', 'SL', 'SL-M')),
  trade_type         text not null check (trade_type in ('BUY', 'SELL')),
  quantity           numeric not null,
  price              numeric,
  trigger_price      numeric,
  status             text not null default 'PENDING'
                       check (status in ('PENDING', 'EXECUTED', 'CANCELLED', 'REJECTED')),
  executed_price     numeric,
  executed_quantity  numeric,
  executed_at        timestamptz,
  simulated_bid      numeric,
  simulated_ask      numeric,
  slippage           numeric not null default 0,
  brokerage          numeric not null default 0,
  strategy_id        text,
  strategy_name      text,
  notes              text,
  tags               text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.positions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  symbol          text not null,
  exchange        text not null,
  instrument_type text not null,
  company_name    text,
  option_type     text,
  strike_price    numeric,
  expiry_date     date,
  lot_size        integer not null default 1,
  quantity        numeric not null,
  average_price   numeric not null,
  total_invested  numeric not null,
  current_price   numeric,
  current_value   numeric,
  pnl             numeric not null default 0,
  pnl_percent     numeric not null default 0,
  day_pnl         numeric not null default 0,
  day_open_price  numeric,
  realized_pnl    numeric not null default 0,
  unrealized_pnl  numeric not null default 0,
  max_profit      numeric not null default 0,
  max_loss        numeric not null default 0,
  notes           text,
  tags            text[],
  status          text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  stop_loss       numeric,
  target          numeric,
  alert_price     numeric,
  trail_amount    numeric,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  updated_at      timestamptz not null default now()
);

-- ============================================================================
-- 2. Drift reconcile — add any columns missing from pre-existing tables.
-- Nullable / with-default adds only, so this never fails on populated tables
-- and never weakens columns that already exist.
-- ============================================================================
alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text not null default '',
  add column if not exists avatar_url text,
  add column if not exists phone_number text,
  add column if not exists virtual_balance numeric not null default 1000000,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz;

alter table public.portfolios
  add column if not exists user_id uuid,
  add column if not exists symbol text,
  add column if not exists company_name text,
  add column if not exists quantity numeric,
  add column if not exists avg_buy_price numeric,
  add column if not exists current_price numeric not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.trades
  add column if not exists user_id uuid,
  add column if not exists symbol text,
  add column if not exists company_name text,
  add column if not exists type text,
  add column if not exists quantity numeric,
  add column if not exists price numeric,
  add column if not exists total_amount numeric,
  add column if not exists created_at timestamptz not null default now();

alter table public.watchlist
  add column if not exists user_id uuid,
  add column if not exists symbol text,
  add column if not exists company_name text,
  add column if not exists added_at timestamptz not null default now();

alter table public.holdings
  add column if not exists user_id uuid,
  add column if not exists symbol text,
  add column if not exists company_name text,
  add column if not exists quantity numeric,
  add column if not exists average_buy_price numeric,
  add column if not exists total_invested numeric,
  add column if not exists current_price numeric,
  add column if not exists current_value numeric,
  add column if not exists pnl numeric not null default 0,
  add column if not exists pnl_percent numeric not null default 0,
  add column if not exists exchange text not null default 'NSE',
  add column if not exists sector text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.orders
  add column if not exists user_id uuid,
  add column if not exists symbol text,
  add column if not exists exchange text,
  add column if not exists instrument_type text,
  add column if not exists company_name text,
  add column if not exists option_type text,
  add column if not exists strike_price numeric,
  add column if not exists expiry_date date,
  add column if not exists lot_size integer not null default 1,
  add column if not exists order_type text,
  add column if not exists trade_type text,
  add column if not exists quantity numeric,
  add column if not exists price numeric,
  add column if not exists trigger_price numeric,
  add column if not exists status text not null default 'PENDING',
  add column if not exists executed_price numeric,
  add column if not exists executed_quantity numeric,
  add column if not exists executed_at timestamptz,
  add column if not exists simulated_bid numeric,
  add column if not exists simulated_ask numeric,
  add column if not exists slippage numeric not null default 0,
  add column if not exists brokerage numeric not null default 0,
  add column if not exists strategy_id text,
  add column if not exists strategy_name text,
  add column if not exists notes text,
  add column if not exists tags text[],
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.positions
  add column if not exists user_id uuid,
  add column if not exists symbol text,
  add column if not exists exchange text,
  add column if not exists instrument_type text,
  add column if not exists company_name text,
  add column if not exists option_type text,
  add column if not exists strike_price numeric,
  add column if not exists expiry_date date,
  add column if not exists lot_size integer not null default 1,
  add column if not exists quantity numeric,
  add column if not exists average_price numeric,
  add column if not exists total_invested numeric,
  add column if not exists current_price numeric,
  add column if not exists current_value numeric,
  add column if not exists pnl numeric not null default 0,
  add column if not exists pnl_percent numeric not null default 0,
  add column if not exists day_pnl numeric not null default 0,
  add column if not exists day_open_price numeric,
  add column if not exists realized_pnl numeric not null default 0,
  add column if not exists unrealized_pnl numeric not null default 0,
  add column if not exists max_profit numeric not null default 0,
  add column if not exists max_loss numeric not null default 0,
  add column if not exists notes text,
  add column if not exists tags text[],
  add column if not exists status text not null default 'OPEN',
  add column if not exists stop_loss numeric,
  add column if not exists target numeric,
  add column if not exists alert_price numeric,
  add column if not exists trail_amount numeric,
  add column if not exists opened_at timestamptz not null default now(),
  add column if not exists closed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================================
-- 3. Indexes
-- ============================================================================
create index if not exists portfolios_user_id_idx   on public.portfolios(user_id);
create index if not exists trades_user_id_idx        on public.trades(user_id);
create index if not exists watchlist_user_id_idx     on public.watchlist(user_id);
create index if not exists holdings_user_id_idx      on public.holdings(user_id);
create index if not exists orders_user_id_idx        on public.orders(user_id);
create index if not exists orders_user_status_idx    on public.orders(user_id, status);
create index if not exists positions_user_id_idx     on public.positions(user_id);
create index if not exists positions_user_status_idx on public.positions(user_id, status);

-- ============================================================================
-- 4. updated_at triggers (tables that carry updated_at)
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['profiles', 'portfolios', 'holdings', 'orders', 'positions'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end$$;

-- ============================================================================
-- 5. Row Level Security — every table is user-scoped (own rows only)
-- ============================================================================
alter table public.profiles   enable row level security;
alter table public.portfolios enable row level security;
alter table public.trades     enable row level security;
alter table public.watchlist  enable row level security;
alter table public.holdings   enable row level security;
alter table public.orders     enable row level security;
alter table public.positions  enable row level security;

-- profiles: keyed by id (= auth.uid()), not user_id
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- user_id-scoped tables: full own-row CRUD
do $$
declare t text;
begin
  foreach t in array array['portfolios', 'trades', 'watchlist', 'holdings', 'orders', 'positions'] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$s', t);
    execute format('create policy "%1$s_select_own" on public.%1$s for select using (auth.uid() = user_id)', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$s', t);
    execute format('create policy "%1$s_insert_own" on public.%1$s for insert with check (auth.uid() = user_id)', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$s', t);
    execute format('create policy "%1$s_update_own" on public.%1$s for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$s', t);
    execute format('create policy "%1$s_delete_own" on public.%1$s for delete using (auth.uid() = user_id)', t);
  end loop;
end$$;

-- ============================================================================
-- 6. Virtual-cash RPCs (called by trade-engine.service.ts)
-- ============================================================================
create or replace function public.deduct_virtual_cash(p_user_id uuid, p_amount numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set virtual_balance = virtual_balance - p_amount,
         updated_at = now()
   where id = p_user_id;
$$;

create or replace function public.add_virtual_cash(p_user_id uuid, p_amount numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set virtual_balance = virtual_balance + p_amount,
         updated_at = now()
   where id = p_user_id;
$$;

grant execute on function public.deduct_virtual_cash(uuid, numeric) to authenticated;
grant execute on function public.add_virtual_cash(uuid, numeric) to authenticated;

-- ============================================================================
-- 7. Signup trigger — create a profile row when an auth user is created.
-- signUp() only sets full_name in auth metadata; the app reads profiles and
-- never inserts, so this trigger is what populates the row.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, virtual_balance)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    1000000
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
