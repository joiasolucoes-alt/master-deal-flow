-- Onda 1.3 - aprovacao de comissao
-- Objetivo: registrar a aprovacao formal da comissao no resultado realizado.
-- Como usar: execute depois do SQL 012.
-- Risco: baixo; adiciona colunas opcionais na tabela realized_results.

alter table public.realized_results
  add column if not exists commission_approval_status text not null default 'pending';

alter table public.realized_results
  add column if not exists commission_approved_by text;

alter table public.realized_results
  add column if not exists commission_approved_at timestamptz;

alter table public.realized_results
  add column if not exists commission_notes text;

alter table public.realized_results
  drop constraint if exists realized_results_commission_approval_status_check;

alter table public.realized_results
  add constraint realized_results_commission_approval_status_check
  check (commission_approval_status in ('pending', 'approved', 'rejected'));

create index if not exists realized_results_commission_approval_status_idx
  on public.realized_results(commission_approval_status);
