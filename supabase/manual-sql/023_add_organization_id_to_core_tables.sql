-- Nome da alteração: Adiciona organization_id ao núcleo comercial + backfill
-- Objetivo: Dar às tabelas simulations/orders/order_items/approvals a coluna
--           organization_id, habilitando RLS por organização (manual-sql/024).
-- Motivo: O diagnóstico mostrou que essas tabelas NÃO têm organization_id, então
--         a RLS do 021 só conseguiu desduplicar as policies abertas nelas, sem
--         isolar por organização. Esta coluna destrava o isolamento real.
-- Risco: MÉDIO. Adiciona coluna (aditivo, não destrói dados) e faz UPDATE de
--        backfill. Rode em preview e confira os nulos antes de FK/NOT NULL.
-- Pode rodar em produção? Sim, após validar em preview e rodar o diagnóstico
--        supabase/diagnostics/002_org_backfill_readiness.sql.
-- Dependências: schema inicial (simulations/orders/order_items/approvals),
--        tabela organizations populada.
-- Reversão: alter table ... drop column organization_id (aditivo, reversível).
--
-- ============================================================================
-- ⚠️ RODE ANTES: supabase/diagnostics/002_org_backfill_readiness.sql
--    • §1 (organizations) = 1  -> caminho PADRÃO abaixo funciona direto.
--    • §1 > 1                  -> use o BLOCO MULTI-ORG (comentado) e confirme
--                                 que units.organization_id existe.
-- ============================================================================

begin;

-- 1. Coluna (aditiva, nullable por enquanto) -------------------------------
alter table public.simulations add column if not exists organization_id uuid;
alter table public.orders       add column if not exists organization_id uuid;
alter table public.order_items  add column if not exists organization_id uuid;
alter table public.approvals    add column if not exists organization_id uuid;

-- 2. Backfill — CAMINHO PADRÃO (organização única) -------------------------
-- Preenche simulations/orders com a única organização; order_items e approvals
-- herdam do pai (order / simulation). Se houver != 1 organização, este bloco
-- NÃO altera nada e avisa via NOTICE (use o bloco multi-org abaixo).
do $$
declare org_count int; the_org uuid;
begin
  select count(*) into org_count from public.organizations;
  select id into the_org from public.organizations limit 1;

  if org_count = 1 then
    update public.simulations set organization_id = the_org where organization_id is null;
    update public.orders       set organization_id = the_org where organization_id is null;
    raise notice 'Backfill organizacao unica aplicado: %', the_org;
  else
    raise notice 'Existem % organizacoes -> pulei simulations/orders. Use o bloco MULTI-ORG.', org_count;
  end if;

  -- Herança do pai (vale para qualquer nº de organizações, roda depois que
  -- simulations/orders estiverem preenchidas):
  update public.order_items oi
     set organization_id = o.organization_id
    from public.orders o
   where oi.order_id = o.id
     and oi.organization_id is null
     and o.organization_id is not null;

  update public.approvals a
     set organization_id = s.organization_id
    from public.simulations s
   where a.simulation_id = s.id
     and a.organization_id is null
     and s.organization_id is not null;
end $$;

-- 3. BLOCO MULTI-ORG (descomente só se §1 > 1 e units.organization_id existir) ---
-- update public.simulations s set organization_id = u.organization_id
--   from public.units u where s.unit_id = u.id and s.organization_id is null;
-- update public.orders o set organization_id = u.organization_id
--   from public.units u where o.unit_id = u.id and o.organization_id is null;
-- -- depois rode de novo a herança do pai do passo 2 para order_items/approvals.
-- -- Alternativa (se units.organization_id NÃO existir): derivar de freights/
-- -- financial_titles, que já têm organization_id populado, via order_external_id.

commit;

-- ============================================================================
-- PÓS-BACKFILL (só quando NÃO houver mais nulos — confira com a query abaixo):
--   select 'simulations' t, count(*) filter (where organization_id is null) nulos
--     from public.simulations
--   union all select 'orders', count(*) filter (where organization_id is null) from public.orders
--   union all select 'order_items', count(*) filter (where organization_id is null) from public.order_items
--   union all select 'approvals', count(*) filter (where organization_id is null) from public.approvals;
--
-- Com 0 nulos, aperte a integridade (opcional, recomendado):
--   alter table public.simulations add constraint simulations_org_fk
--     foreign key (organization_id) references public.organizations(id);
--   alter table public.simulations alter column organization_id set not null;
--   -- idem orders / order_items / approvals.
--
-- E então aplique a RLS por organização: supabase/manual-sql/024.
-- ============================================================================
