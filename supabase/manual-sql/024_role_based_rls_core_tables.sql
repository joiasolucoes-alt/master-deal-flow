-- Nome da alteração: RLS por organização no núcleo comercial (pós-organization_id)
-- Objetivo: Trocar as policies provisórias authenticated_all_* (criadas pelo 021)
--           por RLS por organização em simulations/orders/order_items/approvals.
-- Motivo: Depois do 023, essas tabelas passam a ter organization_id e podem ser
--         isoladas por organização como as demais (fecha o segundo grupo do 021).
-- Risco: ALTO. Mexe em RLS. Teste por perfil em preview.
-- Pode rodar em produção? SOMENTE após 023 aplicado, com organization_id 100%
--        preenchido (0 nulos) e testado em preview.
-- Dependências: manual-sql/021 (limpeza de policies), manual-sql/023 (coluna+backfill).
-- Reversão: recriar as policies authenticated_all_* (using true) do 021.
--
-- ============================================================================
-- ⚠️ PRÉ-REQUISITO: 023 aplicado e SEM nulos em organization_id nas 4 tabelas.
--    Rode a query de verificação do fim do 023 antes de continuar.
-- ============================================================================

begin;

-- Remove as policies provisórias de autenticado que o 021 deixou nessas tabelas.
do $$
declare
  core text[] := array['simulations','orders','order_items','approvals'];
  pol record;
  t text;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname='public' and tablename = any(core)
  loop
    execute format('drop policy if exists %I on public.%I;', pol.policyname, pol.tablename);
  end loop;
  foreach t in array core loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- RLS por organização (mesmo padrão do 021/G1):
--   SELECT: qualquer membro da organização dona da linha.
--   ALL:    membro com papel operacional.
do $$
declare
  core text[] := array['simulations','orders','order_items','approvals'];
  t text;
begin
  foreach t in array core loop
    execute format($p$
      create policy rbac_read_%1$s on public.%1$s for select to authenticated
      using (exists (
        select 1 from public.organization_members om
        where om.organization_id = %1$s.organization_id and om.user_id = auth.uid()
      ));
    $p$, t);

    execute format($p$
      create policy rbac_write_%1$s on public.%1$s for all to authenticated
      using (exists (
        select 1 from public.organization_members om
        where om.organization_id = %1$s.organization_id and om.user_id = auth.uid()
          and om.role in ('admin','gestor','aprovador','financeiro','comercial','frota')
      ))
      with check (exists (
        select 1 from public.organization_members om
        where om.organization_id = %1$s.organization_id and om.user_id = auth.uid()
          and om.role in ('admin','gestor','aprovador','financeiro','comercial','frota')
      ));
    $p$, t);
  end loop;
end $$;

commit;

-- ============================================================================
-- REFINAMENTO FUTURO (por dono) — BLOQUEADO por dado, é decisão de produto:
--   O frontend (src/lib/visibility.ts) restringe Comercial a ver só os próprios
--   registros. O vínculo natural seria simulations.responsible_id -> profiles.id
--   -> profiles.auth_user_id = auth.uid(). A coluna profiles.auth_user_id EXISTE,
--   MAS o diagnóstico mostrou que responsible_id está 100% NULO em simulations e
--   orders — ou seja, hoje não há como amarrar a linha a um auth.uid().
--   Pré-requisito: o app passar a gravar responsible_id (ou um owner_user_id)
--   apontando para o usuário dono. Só então dá para refinar:
--     using ( <membro gestor/aprovador/financeiro/admin da org>  -- vê tudo da org
--             or exists (select 1 from public.profiles p
--                        where p.id = %I.responsible_id and p.auth_user_id = auth.uid()) )
-- ============================================================================
