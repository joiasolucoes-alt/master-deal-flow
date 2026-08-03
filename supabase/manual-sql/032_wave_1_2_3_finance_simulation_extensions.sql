-- Nome da alteracao: Ondas 1, 2 e 3 - simulacao logistica, financeiro detalhado e rateios
-- Objetivo: persistir tipo de carga, veiculo previsto, parcelas, checklist configuravel,
--           submenus financeiros e rateio de comissao/outros.
-- Motivo: manter a nova experiencia do frontend gravando no Supabase.
-- Risco: baixo; script aditivo, sem apagar dados.
-- Pode rodar em producao? Sim, apos SQL 031.
-- Como validar: criar/editar simulacao, salvar despesas com rateio e usar submenus do Financeiro.

alter table if exists public.simulations
  add column if not exists load_mode text,
  add column if not exists planned_vehicle_type text,
  add column if not exists approval_checklist_required jsonb;

alter table if exists public.simulation_costs
  add column if not exists allocation_details jsonb;

alter table if exists public.financial_titles
  add column if not exists kind text default 'standard',
  add column if not exists parent_title_external_id text,
  add column if not exists original_due_date date,
  add column if not exists extended_due_date date,
  add column if not exists anticipated_amount numeric(14,2),
  add column if not exists anticipation_cost numeric(14,2),
  add column if not exists extension_cost numeric(14,2),
  add column if not exists cost_owner text,
  add column if not exists cost_reason text;

update public.financial_titles
set kind = case
  when kind is not null and kind <> '' then kind
  when invoice_number is not null and invoice_number <> '' then 'boleto'
  else 'standard'
end
where kind is null or kind = '';

create index if not exists financial_titles_kind_idx
  on public.financial_titles(kind);

create index if not exists financial_titles_parent_external_idx
  on public.financial_titles(parent_title_external_id);

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'financial_titles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%kind%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.financial_titles drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.financial_titles
  add constraint financial_titles_kind_check
  check (
    kind in (
      'standard',
      'boleto',
      'anticipation',
      'extension',
      'return',
      'shortage',
      'commission',
      'expense'
    )
  );

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'financial_titles'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%cost_owner%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.financial_titles drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.financial_titles
  add constraint financial_titles_cost_owner_check
  check (
    cost_owner is null or cost_owner in (
      'Master',
      'Comercial',
      'Transportadora',
      'Cliente',
      'Fornecedor',
      'Outro'
    )
  );

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'organization_members'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%role%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.organization_members drop constraint %I', constraint_name);
  end if;
end $$;

alter table if exists public.organization_members
  add constraint organization_members_role_check
  check (
    role in (
      'admin',
      'gestor',
      'faturista',
      'comercial',
      'aprovador',
      'financeiro',
      'frete',
      'frota',
      'motorista',
      'viewer'
    )
  );
