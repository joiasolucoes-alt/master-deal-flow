-- Nome da alteração: Onda 1.3 - resultado realizado
-- Objetivo: preparar uma tabela de fechamento para gravar lucro realizado, comissão e comparação de margem.
-- Como usar: execute este SQL no Supabase depois dos scripts da Onda 2.
-- Risco: baixo; cria tabela nova, índices e políticas básicas para usuários autenticados.

create table if not exists public.realized_results (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  order_id uuid null references public.orders(id) on delete set null,
  order_external_id text,
  order_number text not null,
  client_name text not null,
  owner_name text,
  unit_name text,
  status text not null default 'draft' check (status in ('draft','in_progress','closed','cancelled')),
  order_total numeric not null default 0,
  realized_revenue_total numeric not null default 0,
  receivable_open_total numeric not null default 0,
  cost_booked_total numeric not null default 0,
  cost_paid_total numeric not null default 0,
  commission_percent numeric not null default 0,
  commission_total numeric not null default 0,
  realized_profit numeric not null default 0,
  projected_net_result numeric not null default 0,
  predicted_margin_percent numeric not null default 0,
  realized_margin_percent numeric not null default 0,
  margin_delta_percent numeric not null default 0,
  billing_progress numeric not null default 0,
  payment_progress numeric not null default 0,
  delivery_completed boolean not null default false,
  financial_completed boolean not null default false,
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists realized_results_external_id_uidx
  on public.realized_results(external_id)
  where external_id is not null;

create index if not exists realized_results_order_external_idx
  on public.realized_results(order_external_id);

create index if not exists realized_results_status_idx
  on public.realized_results(status);

create index if not exists realized_results_closed_at_idx
  on public.realized_results(closed_at);

alter table public.realized_results enable row level security;

drop policy if exists wave_1_3_read_realized_results on public.realized_results;
create policy wave_1_3_read_realized_results
  on public.realized_results for select
  to authenticated
  using (true);

drop policy if exists wave_1_3_write_realized_results on public.realized_results;
create policy wave_1_3_write_realized_results
  on public.realized_results for all
  to authenticated
  using (true)
  with check (true);
