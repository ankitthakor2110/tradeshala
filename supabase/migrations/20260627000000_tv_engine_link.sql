-- TradingView → trade-engine bridge.
--
-- When TV_ENGINE_EXECUTION is on, each webhook ENTRY places a paper order in the
-- trade simulator (orders/positions) in addition to the tv_* ledger. The exit
-- signal only carries (strategy, symbol) — not the strike/expiry the entry chose
-- — so we record the engine contract here, keyed exactly like the ledger
-- (one open contract per strategy+symbol). The exit reads this row to close the
-- matching position, then deletes it.
--
-- Service-role only: written/read by the webhook handler (admin client). The
-- positions/orders it points at are exposed to the user through their normal RLS.

create table if not exists public.tv_engine_positions (
  strategy        text not null,
  symbol          text not null,
  user_id         uuid not null references auth.users(id) on delete cascade,
  position_id     uuid not null references public.positions(id) on delete cascade,
  instrument_type text not null,
  option_type     text,
  strike_price    numeric,
  expiry_date     text,
  lot_size        numeric not null default 1,
  qty             numeric not null,
  opened_at       timestamptz not null default now(),
  primary key (strategy, symbol)
);

alter table public.tv_engine_positions enable row level security;
-- No policies: only the service-role client (which bypasses RLS) touches this
-- table. Authenticated/anon clients get no access.
