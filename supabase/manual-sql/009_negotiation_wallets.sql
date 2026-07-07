-- Nome da alteração: Etapa 2 - carteira da negociação
-- Objetivo: persistir a carteira do pedido e o extrato de ajustes/sobras de frete no Supabase.
-- Motivo: remover dependência de localStorage na aba Negociações/Pedidos e preservar histórico do pós-pedido.
-- Risco: baixo; cria apenas duas tabelas novas e políticas básicas para usuários autenticados.
-- Pode rodar em produção? Sim, após conferir se os SQLs anteriores já foram aplicados.
-- Dependências: public.orders, public.units e autenticação Supabase já configuradas.
-- Como validar: converter uma simulação em pedido, contratar/alterar frete e conferir o card "Carteira da negociação" no pedido.
-- Reversão sugerida: apagar as tabelas se ainda não houver uso real.

create table if not exists public.negotiation_wallets (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  organization_id uuid null,
  unit_id uuid null references public.units(id) on delete set null,
  order_id uuid null references public.orders(id) on delete set null,
  order_external_id text not null,
  simulation_external_id text not null,
  order_number text not null,
  client_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.negotiation_wallet_entries (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  wallet_id uuid not null references public.negotiation_wallets(id) on delete cascade,
  order_external_id text not null,
  source_module text not null check (source_module in ('freight')),
  category text not null check (category in ('freight_saving','freight_extra_cost')),
  direction text not null check (direction in ('credit','debit')),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  description text not null,
  reference_id text not null,
  occurred_at timestamptz not null,
  reversal_of_entry_external_id text,
  reversed_entry_external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.negotiation_wallets add column if not exists external_id text;
alter table public.negotiation_wallets add column if not exists organization_id uuid null;
alter table public.negotiation_wallets add column if not exists unit_id uuid null references public.units(id) on delete set null;
alter table public.negotiation_wallets add column if not exists order_id uuid null references public.orders(id) on delete set null;
alter table public.negotiation_wallets add column if not exists order_external_id text;
alter table public.negotiation_wallets add column if not exists simulation_external_id text;
alter table public.negotiation_wallets add column if not exists order_number text;
alter table public.negotiation_wallets add column if not exists client_name text;

alter table public.negotiation_wallet_entries add column if not exists external_id text;
alter table public.negotiation_wallet_entries add column if not exists wallet_id uuid references public.negotiation_wallets(id) on delete cascade;
alter table public.negotiation_wallet_entries add column if not exists order_external_id text;
alter table public.negotiation_wallet_entries add column if not exists source_module text;
alter table public.negotiation_wallet_entries add column if not exists category text;
alter table public.negotiation_wallet_entries add column if not exists direction text;
alter table public.negotiation_wallet_entries add column if not exists amount numeric(14,2) not null default 0;
alter table public.negotiation_wallet_entries add column if not exists description text;
alter table public.negotiation_wallet_entries add column if not exists reference_id text;
alter table public.negotiation_wallet_entries add column if not exists occurred_at timestamptz;
alter table public.negotiation_wallet_entries add column if not exists reversal_of_entry_external_id text;
alter table public.negotiation_wallet_entries add column if not exists reversed_entry_external_id text;
alter table public.negotiation_wallet_entries add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists negotiation_wallets_external_id_uidx
  on public.negotiation_wallets(external_id)
  where external_id is not null;

create index if not exists negotiation_wallets_order_external_idx
  on public.negotiation_wallets(order_external_id);

create index if not exists negotiation_wallets_simulation_external_idx
  on public.negotiation_wallets(simulation_external_id);

create unique index if not exists negotiation_wallet_entries_external_id_uidx
  on public.negotiation_wallet_entries(external_id)
  where external_id is not null;

create index if not exists negotiation_wallet_entries_wallet_idx
  on public.negotiation_wallet_entries(wallet_id);

create index if not exists negotiation_wallet_entries_order_external_idx
  on public.negotiation_wallet_entries(order_external_id);

create index if not exists negotiation_wallet_entries_reference_idx
  on public.negotiation_wallet_entries(reference_id);

drop trigger if exists negotiation_wallets_set_updated_at on public.negotiation_wallets;
create trigger negotiation_wallets_set_updated_at
  before update on public.negotiation_wallets
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.negotiation_wallets to authenticated;
grant select, insert, update, delete on public.negotiation_wallet_entries to authenticated;
grant all on public.negotiation_wallets to service_role;
grant all on public.negotiation_wallet_entries to service_role;

alter table public.negotiation_wallets enable row level security;
alter table public.negotiation_wallet_entries enable row level security;

drop policy if exists wave_2_read_negotiation_wallets on public.negotiation_wallets;
create policy wave_2_read_negotiation_wallets
  on public.negotiation_wallets for select
  to authenticated
  using (true);

drop policy if exists wave_2_write_negotiation_wallets on public.negotiation_wallets;
create policy wave_2_write_negotiation_wallets
  on public.negotiation_wallets for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists wave_2_read_negotiation_wallet_entries on public.negotiation_wallet_entries;
create policy wave_2_read_negotiation_wallet_entries
  on public.negotiation_wallet_entries for select
  to authenticated
  using (true);

drop policy if exists wave_2_write_negotiation_wallet_entries on public.negotiation_wallet_entries;
create policy wave_2_write_negotiation_wallet_entries
  on public.negotiation_wallet_entries for all
  to authenticated
  using (true)
  with check (true);
