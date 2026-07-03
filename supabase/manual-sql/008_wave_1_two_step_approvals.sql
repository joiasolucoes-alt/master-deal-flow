-- Onda 1 - Aprovação em duas etapas
-- Objetivo: guardar a aprovação financeira e a aprovação final antes da conversão em pedido.
-- Como usar: executar este arquivo no SQL Editor do Supabase antes de publicar/testar a versão.

alter table public.simulations
  add column if not exists approval_flow jsonb;

alter table public.approvals
  add column if not exists stage text,
  add column if not exists bank_account text,
  add column if not exists decided_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'approvals_stage_check'
      and conrelid = 'public.approvals'::regclass
  ) then
    alter table public.approvals
      add constraint approvals_stage_check
      check (stage is null or stage in ('financial', 'principal'));
  end if;
end $$;

create index if not exists idx_approvals_simulation_stage_status
  on public.approvals(simulation_id, stage, status);

create index if not exists idx_simulations_approval_flow
  on public.simulations using gin (approval_flow);
