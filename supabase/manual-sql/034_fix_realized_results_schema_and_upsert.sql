-- Nome da alteracao: Onda 3.4 - corrigir resultado realizado e fila de comissoes
-- Objetivo: alinhar a tabela realized_results com o frontend atual e permitir upsert por external_id.
-- Motivo: corrigir erros 42P10 (sem regra unica para ON CONFLICT) e PGRST204 (colunas ausentes no cache/schema).
-- Risco: baixo; adiciona colunas ausentes, recria indice unico e recarrega o cache do PostgREST.
-- Pode rodar em producao? Sim, apos SQL 033.

alter table public.realized_results
  add column if not exists external_id text,
  add column if not exists order_external_id text,
  add column if not exists order_number text,
  add column if not exists client_name text,
  add column if not exists owner_name text,
  add column if not exists unit_name text,
  add column if not exists status text not null default 'draft',
  add column if not exists order_total numeric not null default 0,
  add column if not exists realized_revenue_total numeric not null default 0,
  add column if not exists receivable_open_total numeric not null default 0,
  add column if not exists cost_booked_total numeric not null default 0,
  add column if not exists cost_paid_total numeric not null default 0,
  add column if not exists commission_percent numeric not null default 0,
  add column if not exists commission_total numeric not null default 0,
  add column if not exists realized_profit numeric not null default 0,
  add column if not exists projected_net_result numeric not null default 0,
  add column if not exists predicted_margin_percent numeric not null default 0,
  add column if not exists realized_margin_percent numeric not null default 0,
  add column if not exists margin_delta_percent numeric not null default 0,
  add column if not exists billing_progress numeric not null default 0,
  add column if not exists payment_progress numeric not null default 0,
  add column if not exists delivery_completed boolean not null default false,
  add column if not exists financial_completed boolean not null default false,
  add column if not exists commission_approval_status text not null default 'pending',
  add column if not exists commission_approved_by text,
  add column if not exists commission_approved_at timestamptz,
  add column if not exists commission_notes text,
  add column if not exists commission_payment_status text not null default 'pending',
  add column if not exists commission_paid_by text,
  add column if not exists commission_paid_at timestamptz,
  add column if not exists commission_payment_notes text,
  add column if not exists closed_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by text,
  add column if not exists reopen_reason text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.realized_results
set external_id = coalesce(external_id, 'realized-' || coalesce(order_external_id, id::text))
where external_id is null;

update public.realized_results
set
  order_number = coalesce(order_number, order_external_id, external_id, id::text),
  client_name = coalesce(client_name, 'Cliente nao informado'),
  status = coalesce(status, 'draft'),
  commission_approval_status = coalesce(commission_approval_status, 'pending'),
  commission_payment_status = coalesce(commission_payment_status, 'pending'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

alter table public.realized_results
  alter column external_id set not null;

alter table public.realized_results
  alter column order_number set not null;

alter table public.realized_results
  alter column client_name set not null;

alter table public.realized_results
  drop constraint if exists realized_results_status_check;

alter table public.realized_results
  add constraint realized_results_status_check
  check (status in ('draft', 'in_progress', 'closed', 'cancelled'));

alter table public.realized_results
  drop constraint if exists realized_results_commission_approval_status_check;

alter table public.realized_results
  add constraint realized_results_commission_approval_status_check
  check (commission_approval_status in ('pending', 'approved', 'rejected'));

alter table public.realized_results
  drop constraint if exists realized_results_commission_payment_status_check;

alter table public.realized_results
  add constraint realized_results_commission_payment_status_check
  check (commission_payment_status in ('pending', 'paid', 'blocked'));

drop index if exists public.realized_results_external_id_uidx;
drop index if exists public.realized_results_external_id_key;

create unique index realized_results_external_id_key
  on public.realized_results(external_id);

create index if not exists realized_results_order_external_idx
  on public.realized_results(order_external_id);

create index if not exists realized_results_status_idx
  on public.realized_results(status);

create index if not exists realized_results_commission_approval_status_idx
  on public.realized_results(commission_approval_status);

create index if not exists realized_results_commission_payment_status_idx
  on public.realized_results(commission_payment_status);

notify pgrst, 'reload schema';
