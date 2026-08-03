-- Nome da alteracao: Onda 1.3 - pagamento de comissao e reabertura de resultado
-- Objetivo: permitir fila de comissoes, pagamento controlado e reabertura auditavel do resultado.
-- Motivo: completar o ciclo gerencial apos entrega/recebimento/fechamento.
-- Risco: baixo; adiciona colunas opcionais em realized_results.
-- Pode rodar em producao? Sim, apos SQL 032.

alter table public.realized_results
  add column if not exists commission_payment_status text not null default 'pending',
  add column if not exists commission_paid_by text,
  add column if not exists commission_paid_at timestamptz,
  add column if not exists commission_payment_notes text,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by text,
  add column if not exists reopen_reason text;

alter table public.realized_results
  drop constraint if exists realized_results_commission_payment_status_check;

alter table public.realized_results
  add constraint realized_results_commission_payment_status_check
  check (commission_payment_status in ('pending', 'paid', 'blocked'));

create index if not exists realized_results_commission_payment_status_idx
  on public.realized_results(commission_payment_status);

create index if not exists realized_results_reopened_at_idx
  on public.realized_results(reopened_at);
