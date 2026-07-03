-- Nome da alteração: Onda 2 - títulos financeiros
-- Objetivo: permitir que pedidos gerem contas a receber no Financeiro.
-- Motivo: iniciar a operação pós-pedido com controle de vencimento, recebimento e baixa.
-- Risco: baixo; cria/ajusta apenas a tabela financial_titles e políticas básicas.
-- Pode rodar em produção? Sim, após conferir se os SQLs anteriores já foram aplicados.
-- Dependências: tabela public.orders e autenticação Supabase já configuradas.
-- Como validar: acessar Financeiro, gerar contas dos pedidos e dar baixa em uma conta.
-- Reversão sugerida: remover as colunas adicionadas ou apagar a tabela se ainda não houver uso real.

create table if not exists public.financial_titles (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  organization_id uuid null,
  unit_id uuid null references public.units(id),
  order_id uuid null references public.orders(id) on delete set null,
  order_external_id text,
  order_number text,
  client_name text,
  title_number text,
  type text not null default 'receivable' check (type in ('receivable','payable')),
  status text not null default 'open' check (status in ('open','partial','paid','overdue','cancelled')),
  due_date date,
  amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  payment_method text,
  bank_name text,
  notes text,
  owner_name text,
  unit_name text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.financial_titles add column if not exists external_id text;
alter table public.financial_titles add column if not exists order_external_id text;
alter table public.financial_titles add column if not exists order_number text;
alter table public.financial_titles add column if not exists client_name text;
alter table public.financial_titles add column if not exists owner_name text;
alter table public.financial_titles add column if not exists unit_name text;
alter table public.financial_titles add column if not exists paid_at timestamptz;

create unique index if not exists financial_titles_external_id_uidx
  on public.financial_titles(external_id)
  where external_id is not null;

create index if not exists financial_titles_order_external_idx
  on public.financial_titles(order_external_id);

create index if not exists financial_titles_status_idx
  on public.financial_titles(status);

create index if not exists financial_titles_due_date_idx
  on public.financial_titles(due_date);

alter table public.financial_titles enable row level security;

drop policy if exists wave_2_read_financial_titles on public.financial_titles;
create policy wave_2_read_financial_titles
  on public.financial_titles for select
  to authenticated
  using (true);

drop policy if exists wave_2_write_financial_titles on public.financial_titles;
create policy wave_2_write_financial_titles
  on public.financial_titles for all
  to authenticated
  using (true)
  with check (true);
