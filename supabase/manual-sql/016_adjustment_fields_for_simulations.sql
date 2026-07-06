-- Nome da alteração: Onda 3 - campos de reajuste em simulações
-- Objetivo: guardar motivo, data, etapa e solicitante do reajuste direto na simulação.
-- Motivo: a aba Reajustes deve consultar somente simulações devolvidas, sem carregar tudo no frontend.
-- Risco: baixo; adiciona colunas opcionais e índices, sem apagar dados existentes.
-- Pode rodar em produção? Sim.
-- Dependências: tabela public.simulations e tabela public.approvals existentes.
-- Como validar: solicitar ajuste em uma simulação e conferir a aba Reajustes na conta Comercial.
-- Reversão sugerida: remover os índices e colunas abaixo se ainda não houver uso real.

alter table public.simulations
  add column if not exists adjustment_reason text,
  add column if not exists adjustment_requested_at timestamptz,
  add column if not exists adjustment_requested_by text,
  add column if not exists adjustment_stage text
    check (adjustment_stage is null or adjustment_stage in ('financial', 'principal'));

create index if not exists idx_simulations_adjustment_queue
  on public.simulations(status, adjustment_requested_at desc)
  where status = 'Ajuste solicitado';

create index if not exists idx_simulations_adjustment_owner
  on public.simulations(responsible_name)
  where status = 'Ajuste solicitado';

with latest_adjustment as (
  select distinct on (a.simulation_id)
    a.simulation_id,
    a.comment,
    a.stage,
    a.approver_id,
    coalesce(a.decided_at, a.updated_at, a.created_at) as requested_at
  from public.approvals a
  where a.status = 'adjustment_requested'
  order by a.simulation_id, coalesce(a.decided_at, a.updated_at, a.created_at) desc
)
update public.simulations s
set
  adjustment_reason = coalesce(s.adjustment_reason, latest_adjustment.comment, s.approval_notes),
  adjustment_requested_at = coalesce(s.adjustment_requested_at, latest_adjustment.requested_at),
  adjustment_requested_by = coalesce(s.adjustment_requested_by, latest_adjustment.approver_id::text),
  adjustment_stage = coalesce(s.adjustment_stage, latest_adjustment.stage)
from latest_adjustment
where s.id = latest_adjustment.simulation_id
  and s.status = 'Ajuste solicitado';
