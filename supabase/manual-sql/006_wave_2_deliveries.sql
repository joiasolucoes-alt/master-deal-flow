-- Nome da alteração: Onda 2 - entregas operacionais
-- Objetivo: permitir que fretes gerem entregas e registrem avanço/ocorrência.
-- Motivo: completar o fluxo pós-pedido básico: pedido -> frete -> entrega.
-- Risco: baixo; cria/ajusta apenas a tabela deliveries e políticas básicas.
-- Pode rodar em produção? Sim, após conferir se os SQLs anteriores já foram aplicados.
-- Dependências: tabela public.orders, public.freights e autenticação Supabase já configuradas.
-- Como validar: acessar Entregas, gerar entregas dos fretes, avançar uma entrega e registrar ocorrência.
-- Reversão sugerida: remover as colunas adicionadas ou apagar a tabela se ainda não houver uso real.

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  organization_id uuid null,
  unit_id uuid null references public.units(id),
  order_id uuid null references public.orders(id) on delete set null,
  freight_id uuid null references public.freights(id) on delete set null,
  order_external_id text,
  order_number text,
  freight_external_id text,
  freight_code text,
  client_name text,
  route text,
  status text not null default 'pending' check (status in ('pending','loading','loaded','in_route','arrived','delivered','issue','cancelled')),
  current_location text,
  expected_delivery_date timestamptz,
  delivered_at timestamptz,
  proof_notes text,
  occurrence_notes text,
  owner_name text,
  unit_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.deliveries alter column organization_id drop not null;
alter table public.deliveries add column if not exists external_id text;
alter table public.deliveries add column if not exists order_external_id text;
alter table public.deliveries add column if not exists order_number text;
alter table public.deliveries add column if not exists freight_external_id text;
alter table public.deliveries add column if not exists freight_code text;
alter table public.deliveries add column if not exists client_name text;
alter table public.deliveries add column if not exists route text;
alter table public.deliveries add column if not exists expected_delivery_date timestamptz;
alter table public.deliveries add column if not exists proof_notes text;
alter table public.deliveries add column if not exists occurrence_notes text;
alter table public.deliveries add column if not exists owner_name text;
alter table public.deliveries add column if not exists unit_name text;

create unique index if not exists deliveries_external_id_uidx
  on public.deliveries(external_id)
  where external_id is not null;

create index if not exists deliveries_order_external_idx
  on public.deliveries(order_external_id);

create index if not exists deliveries_freight_external_idx
  on public.deliveries(freight_external_id);

create index if not exists deliveries_status_idx
  on public.deliveries(status);

create index if not exists deliveries_expected_delivery_idx
  on public.deliveries(expected_delivery_date);

alter table public.deliveries enable row level security;

drop policy if exists wave_2_read_deliveries on public.deliveries;
create policy wave_2_read_deliveries
  on public.deliveries for select
  to authenticated
  using (true);

drop policy if exists wave_2_write_deliveries on public.deliveries;
create policy wave_2_write_deliveries
  on public.deliveries for all
  to authenticated
  using (true)
  with check (true);
