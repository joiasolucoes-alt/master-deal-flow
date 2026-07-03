-- Nome da alteração: Reforço do fluxo de aprovações
-- Objetivo: Garantir colunas, índices e metadados úteis para registrar decisões de aprovação.
-- Motivo: A Onda 1.1 usa a tabela approvals para status, checklist, comentário, aprovador e histórico.
-- Risco: Baixo; script idempotente, sem DROP e sem apagar dados.
-- Pode rodar em produção? Sim
-- Dependências: Tabelas public.approvals, public.simulations e public.profiles já existentes.
-- Como validar: Enviar uma simulação para aprovação e conferir uma linha em public.approvals.
-- Reversão sugerida: Remover manualmente os índices criados, se necessário.

alter table public.approvals
  add column if not exists external_id text,
  add column if not exists approver_id uuid references public.profiles(id),
  add column if not exists checklist jsonb not null default '{}'::jsonb,
  add column if not exists comment text,
  add column if not exists requested_changes jsonb,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists approvals_external_id_key
  on public.approvals(external_id)
  where external_id is not null;

create index if not exists idx_approvals_simulation_status
  on public.approvals(simulation_id, status);

create index if not exists idx_approvals_approver
  on public.approvals(approver_id);

drop trigger if exists set_approvals_updated_at on public.approvals;
create trigger set_approvals_updated_at
before update on public.approvals
for each row execute function public.set_updated_at();
