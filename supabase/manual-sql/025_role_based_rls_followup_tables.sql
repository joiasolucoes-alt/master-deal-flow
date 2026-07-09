-- ============================================================================
-- ⚠️⚠️ APLICADO E DEPOIS REVERTIDO EM PRODUÇÃO (2026-07-09) — NÃO REAPLICAR.
-- Ver o banner do 021 e docs/rls-refinement.md ("Incidente e reversão").
-- Rollback em manual-sql/026.
-- ============================================================================
-- Nome da alteração: RLS por organização nas tabelas restantes (follow-up do 021/024)
-- Objetivo: Fechar a lacuna deixada pelo 021 — tabelas que ficaram com policies abertas
--           por não estarem no escopo inicial: filhas de simulação, realized_results,
--           negotiations, units e profiles.
-- Motivo: Consistência de isolamento. Sem isto, um usuário vê itens/custos de simulações
--         de outra organização (irrelevante em org única com todos admin; importa em multi-org).
-- Risco: ALTO (mexe em RLS). Teste por perfil em preview.
-- Dependências: 021 (limpeza + policy rbac_read_own_membership em organization_members),
--               023 (organization_id em simulations/orders). SEM o 021, isto não funciona,
--               pois todas as policies dependem de ler organization_members.
-- Reversão: reaplicar 003_basic_rls_for_homologation.sql (abre tudo de novo).
--
-- ============================================================================
-- Estrutura confirmada (diagnóstico):
--   • simulation_items/costs/purchase_costs/installments: sem org, têm simulation_id
--       -> derivam a org do pai public.simulations (que já tem organization_id via 023).
--   • realized_results: sem org, tem order_id -> deriva do pai public.orders.
--   • negotiations: sem org e sem pai -> recebe organization_id + backfill (org única).
--   • units: tem organization_id -> RLS por org direta.
--   • profiles: tabela de identidade, sem org. Leitura liberada a autenticados (o app
--       precisa resolver nomes em toda tela); escrita restrita a admin OU ao próprio
--       usuário (profiles.auth_user_id = auth.uid()).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- PASSO 1 — Limpa as policies abertas empilhadas nestas tabelas.
-- ---------------------------------------------------------------------------
do $$
declare
  tabelas text[] := array[
    'simulation_items','simulation_costs','simulation_purchase_costs','simulation_installments',
    'realized_results','negotiations','units','profiles'
  ];
  pol record; t text;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname='public' and tablename = any(tabelas)
  loop
    execute format('drop policy if exists %I on public.%I;', pol.policyname, pol.tablename);
  end loop;
  foreach t in array tabelas loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 2 — Filhas de simulação: org derivada do pai (simulations.organization_id).
-- ---------------------------------------------------------------------------
do $$
declare
  filhas text[] := array['simulation_items','simulation_costs',
                         'simulation_purchase_costs','simulation_installments'];
  t text;
begin
  foreach t in array filhas loop
    execute format($p$
      create policy rbac_read_%1$s on public.%1$s for select to authenticated
      using (exists (
        select 1 from public.simulations s
        join public.organization_members om on om.organization_id = s.organization_id
        where s.id = %1$s.simulation_id and om.user_id = auth.uid()
      ));
    $p$, t);
    execute format($p$
      create policy rbac_write_%1$s on public.%1$s for all to authenticated
      using (exists (
        select 1 from public.simulations s
        join public.organization_members om on om.organization_id = s.organization_id
        where s.id = %1$s.simulation_id and om.user_id = auth.uid()
          and om.role in ('admin','gestor','aprovador','financeiro','comercial','frota')
      ))
      with check (exists (
        select 1 from public.simulations s
        join public.organization_members om on om.organization_id = s.organization_id
        where s.id = %1$s.simulation_id and om.user_id = auth.uid()
          and om.role in ('admin','gestor','aprovador','financeiro','comercial','frota')
      ));
    $p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 3 — realized_results: org derivada do pai (orders.organization_id).
-- ---------------------------------------------------------------------------
create policy rbac_read_realized_results on public.realized_results for select to authenticated
using (exists (
  select 1 from public.orders o
  join public.organization_members om on om.organization_id = o.organization_id
  where o.id = realized_results.order_id and om.user_id = auth.uid()
));
create policy rbac_write_realized_results on public.realized_results for all to authenticated
using (exists (
  select 1 from public.orders o
  join public.organization_members om on om.organization_id = o.organization_id
  where o.id = realized_results.order_id and om.user_id = auth.uid()
    and om.role in ('admin','gestor','aprovador','financeiro')
))
with check (exists (
  select 1 from public.orders o
  join public.organization_members om on om.organization_id = o.organization_id
  where o.id = realized_results.order_id and om.user_id = auth.uid()
    and om.role in ('admin','gestor','aprovador','financeiro')
));

-- ---------------------------------------------------------------------------
-- PASSO 4 — negotiations: adiciona organization_id + backfill (org única) + RLS.
-- ---------------------------------------------------------------------------
alter table public.negotiations add column if not exists organization_id uuid;
do $$
declare org_count int; the_org uuid;
begin
  select count(*) into org_count from public.organizations;
  if org_count <> 1 then
    raise exception 'negotiations backfill assume organizacao unica (encontrei %).', org_count;
  end if;
  select id into the_org from public.organizations limit 1;
  update public.negotiations set organization_id = the_org where organization_id is null;
end $$;

create policy rbac_read_negotiations on public.negotiations for select to authenticated
using (exists (select 1 from public.organization_members om
  where om.organization_id = negotiations.organization_id and om.user_id = auth.uid()));
create policy rbac_write_negotiations on public.negotiations for all to authenticated
using (exists (select 1 from public.organization_members om
  where om.organization_id = negotiations.organization_id and om.user_id = auth.uid()
    and om.role in ('admin','gestor','aprovador','financeiro','comercial','frota')))
with check (exists (select 1 from public.organization_members om
  where om.organization_id = negotiations.organization_id and om.user_id = auth.uid()
    and om.role in ('admin','gestor','aprovador','financeiro','comercial','frota')));

-- ---------------------------------------------------------------------------
-- PASSO 5 — units: RLS por organização direta (units.organization_id).
-- ---------------------------------------------------------------------------
create policy rbac_read_units on public.units for select to authenticated
using (exists (select 1 from public.organization_members om
  where om.organization_id = units.organization_id and om.user_id = auth.uid()));
create policy rbac_write_units on public.units for all to authenticated
using (exists (select 1 from public.organization_members om
  where om.organization_id = units.organization_id and om.user_id = auth.uid()
    and om.role = 'admin'))
with check (exists (select 1 from public.organization_members om
  where om.organization_id = units.organization_id and om.user_id = auth.uid()
    and om.role = 'admin'));

-- ---------------------------------------------------------------------------
-- PASSO 6 — profiles: identidade. Leitura para autenticados (o app resolve nomes
-- em toda tela). Escrita só admin (membro) OU o próprio usuário.
-- ---------------------------------------------------------------------------
create policy rbac_read_profiles on public.profiles for select to authenticated using (true);
create policy rbac_write_profiles on public.profiles for all to authenticated
using (
  profiles.auth_user_id = auth.uid()
  or exists (select 1 from public.organization_members om
       where om.user_id = auth.uid() and om.role = 'admin')
)
with check (
  profiles.auth_user_id = auth.uid()
  or exists (select 1 from public.organization_members om
       where om.user_id = auth.uid() and om.role = 'admin')
);

commit;
