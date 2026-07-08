-- Nome da alteração: Onda - pre-pedido, pagamento e liberacao operacional
-- Objetivo: Persistir a nova etapa em que a proposta aprovada aguarda pagamento, comprovante e validacao comercial antes de virar pedido.
-- Motivo: O cliente validou que a proposta nao pode virar pedido apenas com aprovacao do Gestor.
-- Risco: Baixo/medio. Adiciona colunas opcionais e amplia constraints de status, sem apagar dados.
-- Pode rodar em produção? Sim, apos backup ou janela controlada.
-- Dependências: Tabelas public.simulations, public.financial_titles, public.orders e public.freights existentes.
-- Como validar: Criar proposta, aprovar pelo Gestor, pagar no Financeiro, informar comprovante, validar pelo Comercial e conferir se o pedido nasce depois disso.
-- Reversão sugerida: Remover as colunas adicionadas e restaurar constraints anteriores de status, se necessario.

alter table if exists public.simulations
  add column if not exists payment_requested_at timestamptz,
  add column if not exists payment_paid_at timestamptz,
  add column if not exists payment_paid_by text,
  add column if not exists payment_receipt_file_name text,
  add column if not exists payment_receipt_file_path text,
  add column if not exists payment_receipt_attached_at timestamptz,
  add column if not exists payment_receipt_attached_by text,
  add column if not exists payment_validation_notes text,
  add column if not exists payment_validated_at timestamptz,
  add column if not exists payment_validated_by text,
  add column if not exists payment_adjustment_reason text;

alter table if exists public.financial_titles
  add column if not exists simulation_external_id text,
  add column if not exists simulation_number text,
  add column if not exists proof_file_name text,
  add column if not exists proof_file_path text,
  add column if not exists proof_attached_at timestamptz,
  add column if not exists proof_attached_by text;

create index if not exists idx_financial_titles_simulation_external_id
  on public.financial_titles(simulation_external_id);

create index if not exists idx_simulations_payment_status
  on public.simulations(status, payment_requested_at, payment_paid_at, payment_validated_at);

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'public.simulations'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';

  if constraint_name is not null then
    execute format('alter table public.simulations drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.simulations
  add constraint simulations_status_operational_flow_check
  check (
    status in (
      'Rascunho',
      'Em análise',
      'Pendente de aprovação',
      'Aguardando financeiro',
      'Aguardando aprovação do Gestor',
      'Aguardando pagamento',
      'Pagamento realizado',
      'Comprovante anexado',
      'Aguardando validação comercial',
      'Validada pelo comercial',
      'Aprovada',
      'Reprovada',
      'Ajuste solicitado',
      'Pedido confirmado',
      'Cancelada'
    )
  );

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'public.orders'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';

  if constraint_name is not null then
    execute format('alter table public.orders drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.orders
  add constraint orders_status_operational_flow_check
  check (
    status in (
      'Pedido confirmado',
      'Aguardando faturamento',
      'Em faturamento',
      'Aguardando frete',
      'Frete liberado',
      'Em separação',
      'Em rota',
      'Entregue',
      'Finalizada',
      'Cancelada'
    )
  );
