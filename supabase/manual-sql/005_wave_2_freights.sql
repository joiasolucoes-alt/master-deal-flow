-- Nome da alteração: Onda 2 - fretes operacionais
-- Objetivo: permitir que pedidos gerem fretes e avancem o status logístico.
-- Motivo: iniciar a operação pós-pedido depois do financeiro, ligando Fretes aos Pedidos.
-- Risco: baixo; cria/ajusta apenas a tabela freights e políticas básicas.
-- Pode rodar em produção? Sim, após conferir se os SQLs anteriores já foram aplicados.
-- Dependências: tabela public.orders e autenticação Supabase já configuradas.
-- Como validar: acessar Fretes, gerar fretes dos pedidos e avançar um frete.
-- Reversão sugerida: remover as colunas adicionadas ou apagar a tabela se ainda não houver uso real.

create table if not exists public.freights (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  code text,
  organization_id uuid null,
  unit_id uuid null references public.units(id),
  order_id uuid null references public.orders(id) on delete set null,
  order_external_id text,
  order_number text,
  client_name text,
  carrier_name text,
  driver_name text,
  vehicle_description text,
  vehicle_plate text,
  trailer_plate text,
  antt text,
  route text,
  freight_value numeric(14,2) default 0,
  weight_label text,
  status text not null default 'quoted' check (status in ('quoted','hired','loading','in_route','delivered','cancelled')),
  pickup_date timestamptz,
  expected_delivery_date timestamptz,
  owner_name text,
  unit_name text,
  notes text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.freights alter column organization_id drop not null;
alter table public.freights add column if not exists external_id text;
alter table public.freights add column if not exists code text;
alter table public.freights add column if not exists order_external_id text;
alter table public.freights add column if not exists order_number text;
alter table public.freights add column if not exists client_name text;
alter table public.freights add column if not exists vehicle_description text;
alter table public.freights add column if not exists route text;
alter table public.freights add column if not exists weight_label text;
alter table public.freights add column if not exists owner_name text;
alter table public.freights add column if not exists unit_name text;
alter table public.freights add column if not exists notes text;
alter table public.freights add column if not exists delivered_at timestamptz;

create unique index if not exists freights_external_id_uidx
  on public.freights(external_id)
  where external_id is not null;

create index if not exists freights_order_external_idx
  on public.freights(order_external_id);

create index if not exists freights_status_idx
  on public.freights(status);

create index if not exists freights_expected_delivery_idx
  on public.freights(expected_delivery_date);

alter table public.freights enable row level security;

drop policy if exists wave_2_read_freights on public.freights;
create policy wave_2_read_freights
  on public.freights for select
  to authenticated
  using (true);

drop policy if exists wave_2_write_freights on public.freights;
create policy wave_2_write_freights
  on public.freights for all
  to authenticated
  using (true)
  with check (true);
