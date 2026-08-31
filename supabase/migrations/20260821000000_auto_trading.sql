-- ============================================================================
-- Automatic Trade Taker — per-account configuration, config version history, and
-- per-signal decision/audit records.
--
-- Idempotent + safe to re-run (paste into Supabase Dashboard → SQL Editor).
--
-- Isolation model (matches the rest of the app):
--   * trading_configs / trading_config_versions / auto_trade_decisions are
--     PER-USER — own-row RLS (auth.uid() = user_id) so a user only ever sees
--     their own automation. The user edits config through session-scoped API
--     routes; those inserts/updates satisfy the own-row policies.
--   * The webhook handler runs with the SERVICE-ROLE client (no user session),
--     which bypasses RLS to read config + write decisions for the configured
--     trade account — the same pattern the tv_* ledger already uses.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. trading_configs — the ACTIVE config for each account (one row per user).
-- ---------------------------------------------------------------------------
create table if not exists public.trading_configs (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  config            jsonb not null,
  version           integer not null default 1,
  -- Emergency stop is a top-level safety override, separate from config.enabled,
  -- toggled by the STOP/RESUME actions.
  emergency_stopped boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.trading_configs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trading_configs' and policyname = 'tc_select_own') then
    create policy "tc_select_own" on public.trading_configs for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trading_configs' and policyname = 'tc_insert_own') then
    create policy "tc_insert_own" on public.trading_configs for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trading_configs' and policyname = 'tc_update_own') then
    create policy "tc_update_own" on public.trading_configs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trading_configs' and policyname = 'tc_delete_own') then
    create policy "tc_delete_own" on public.trading_configs for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. trading_config_versions — append-only history for audit (spec section 30).
--    A trade references (user_id, version) so we know which config was active.
-- ---------------------------------------------------------------------------
create table if not exists public.trading_config_versions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  version    integer not null,
  config     jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  unique (user_id, version)
);

create index if not exists idx_tcv_user_version on public.trading_config_versions (user_id, version desc);

alter table public.trading_config_versions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trading_config_versions' and policyname = 'tcv_select_own') then
    create policy "tcv_select_own" on public.trading_config_versions for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trading_config_versions' and policyname = 'tcv_insert_own') then
    create policy "tcv_insert_own" on public.trading_config_versions for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. auto_trade_decisions — one row per processed signal (spec sections 25, 44).
--    Powers the Signals decision table + full audit trail. The partial unique
--    index on (user_id, dedupe_key) is the DB-level idempotency guard (section
--    34): a duplicate webhook cannot create a second decision row.
-- ---------------------------------------------------------------------------
create table if not exists public.auto_trade_decisions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  webhook_log_id    uuid references public.tv_webhook_logs(id) on delete set null,
  dedupe_key        text,
  status            text not null default 'PROCESSING'
                      check (status in ('PROCESSING','EXECUTED','SKIPPED','REJECTED','FAILED','DUPLICATE','PROPOSED','DRY_RUN','CANCELLED')),
  reason            text,
  mode              text,
  -- normalized signal
  symbol            text,
  direction         text,
  option_type       text,
  side              text,
  strategy          text,
  timeframe         text,
  signal_price      numeric,
  signal_time       timestamptz,
  -- selection / plan
  strike            numeric,
  expiry            text,
  delta             numeric,
  entry_price       numeric,
  quantity          numeric,
  lot_size          numeric,
  target            numeric,
  stop_loss         numeric,
  target_type       text,
  stop_loss_type    text,
  open_action       text,
  -- audit / provenance
  config_version    integer,
  audit_trail       jsonb,
  normalized_signal jsonb,
  raw_payload       jsonb,
  -- links into the simulator
  order_id          uuid,
  position_id       uuid,
  realized_pnl      numeric,
  is_auto           boolean not null default true,
  dry_run           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_atd_user_created on public.auto_trade_decisions (user_id, created_at desc);
create index if not exists idx_atd_status on public.auto_trade_decisions (user_id, status);
-- Idempotency: at most one decision per (user, dedupe_key). Dry-run/test rows use
-- a null dedupe_key so they never collide with real signals.
create unique index if not exists uq_atd_user_dedupe
  on public.auto_trade_decisions (user_id, dedupe_key)
  where dedupe_key is not null;

alter table public.auto_trade_decisions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'auto_trade_decisions' and policyname = 'atd_select_own') then
    create policy "atd_select_own" on public.auto_trade_decisions for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'auto_trade_decisions' and policyname = 'atd_insert_own') then
    create policy "atd_insert_own" on public.auto_trade_decisions for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'auto_trade_decisions' and policyname = 'atd_update_own') then
    create policy "atd_update_own" on public.auto_trade_decisions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Breakeven support on positions (spec section 19). When be_activation is set
--    and the position moves that many premium-points into profit, the server GTT
--    pass raises the stop to average_price + be_offset (once). Nullable → no
--    effect on existing/manual positions.
-- ---------------------------------------------------------------------------
alter table public.positions add column if not exists be_activation numeric;
alter table public.positions add column if not exists be_offset numeric;

-- keep updated_at fresh (reuses the shared trigger helper from the baseline)
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_trading_configs_updated_at') then
    create trigger trg_trading_configs_updated_at before update on public.trading_configs
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_auto_trade_decisions_updated_at') then
    create trigger trg_auto_trade_decisions_updated_at before update on public.auto_trade_decisions
      for each row execute function public.set_updated_at();
  end if;
end $$;
