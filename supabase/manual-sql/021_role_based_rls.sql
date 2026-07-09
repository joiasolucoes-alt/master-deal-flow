-- ============================================================================
-- ⚠️⚠️ APLICADO E DEPOIS REVERTIDO EM PRODUÇÃO (2026-07-09) — NÃO REAPLICAR.
-- Quebrou a CRIAÇÃO de registros: o app não grava organization_id no INSERT, então
-- o `with check` rejeitava as gravações. Rollback em manual-sql/026. Só reaplicar
-- DEPOIS que o app (ou um trigger) passar a preencher organization_id. Ver
-- docs/rls-refinement.md ("Incidente e reversão").
-- ============================================================================
-- Nome da alteração: RLS por papel + limpeza de políticas abertas redundantes
-- Objetivo: Substituir as várias gerações de políticas abertas (using true) por um
--           conjunto único, e aplicar RLS por papel nas tabelas que têm organization_id.
-- Motivo: O diagnóstico (supabase/diagnostics) mostrou que cada tabela acumulou 2–4
--         políticas abertas empilhadas (wave_1_1_*, authenticated_*, wave_2_*, wave_3_*),
--         e que a RLS por papel das carteiras está ANULADA por políticas wave_2_* abertas.
-- Risco: ALTO. Mexe em RLS. Teste em branch/preview antes de produção.
-- Pode rodar em produção? SOMENTE após revisão + teste por perfil em preview.
--
-- ============================================================================
-- ⚠️ LEIA docs/rls-refinement.md e docs/schema-consolidation.md ANTES.
-- ============================================================================
-- ESTADO REAL DO BANCO (confirmado via diagnóstico em 2026-07):
--   • Trilha de schema: A (waves). organization_id existe em:
--       clients, suppliers, products, freights, deliveries, financial_titles.
--     E NÃO existe em:
--       simulations, orders, order_items, approvals, freight_documents,
--       audit_events, notifications.
--   • Por isso este script trata as tabelas em DOIS grupos:
--       G1 (com organization_id) -> RLS por papel real (membro da organização).
--       G2 (sem organization_id) -> dedup para UMA política de autenticado + TODO
--         de adicionar organization_id para isolar de verdade (ver fim do arquivo).
--   • Pré-requisito G1: public.organization_members precisa estar POPULADA, senão a
--     RLS por papel bloqueia tudo (comportamento correto, mas cadastre os usuários antes).
-- Reversão: reaplicar 003_basic_rls_for_homologation.sql restaura o acesso aberto.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- PASSO 0 — Backfill de organization_id nulo (OBRIGATÓRIO antes da RLS por org).
-- O diagnóstico encontrou linhas com organization_id NULL em freights/deliveries/
-- financial_titles. Com a RLS por organização ligada, linhas sem org ficariam
-- INVISÍVEIS no app. Como o banco tem organização única, preenchemos os nulos com
-- ela. Guardado: se houver != 1 organização, ABORTA (não dá para inferir com segurança).
-- ---------------------------------------------------------------------------
do $$
declare org_count int; the_org uuid;
begin
  select count(*) into org_count from public.organizations;
  if org_count <> 1 then
    raise exception 'Este script assume organizacao unica (encontrei %). Ajuste o PASSO 0 antes de rodar.', org_count;
  end if;
  select id into the_org from public.organizations limit 1;

  update public.clients          set organization_id = the_org where organization_id is null;
  update public.suppliers        set organization_id = the_org where organization_id is null;
  update public.products         set organization_id = the_org where organization_id is null;
  update public.freights         set organization_id = the_org where organization_id is null;
  update public.deliveries       set organization_id = the_org where organization_id is null;
  update public.financial_titles set organization_id = the_org where organization_id is null;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 1 — Remover TODAS as políticas das tabelas-alvo (limpa as gerações
-- empilhadas). Recriamos o conjunto correto nos passos seguintes. Como está tudo
-- dentro de uma transação, qualquer erro faz rollback e nada fica sem política.
-- ---------------------------------------------------------------------------
do $$
declare
  target_tables text[] := array[
    -- G1 (com organization_id)
    'clients','suppliers','products','freights','deliveries','financial_titles',
    -- carteiras (têm organization_id e RLS por papel, mas com dupes abertas)
    'negotiation_wallets','negotiation_wallet_entries',
    -- G2 (sem organization_id)
    'simulations','orders','order_items','approvals','freight_documents',
    'audit_events','notifications'
  ];
  pol record;
  t text;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public' and tablename = any(target_tables)
  loop
    execute format('drop policy if exists %I on public.%I;', pol.policyname, pol.tablename);
  end loop;

  -- Garante RLS ligada em todas.
  foreach t in array target_tables loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- PASSO 1.5 — organization_members precisa ser LEGÍVEL pelo próprio usuário.
-- CRÍTICO: todas as policies rbac_* fazem `exists (select 1 from organization_members
-- where user_id = auth.uid())`. Se organization_members tiver RLS ligada e NENHUMA
-- policy (que era o caso), essa subconsulta retorna 0 para o usuário autenticado e a
-- RLS esconde TUDO. Esta policy (não recursiva: só a própria associação) destrava.
-- ---------------------------------------------------------------------------
alter table public.organization_members enable row level security;
drop policy if exists rbac_read_own_membership on public.organization_members;
create policy rbac_read_own_membership on public.organization_members
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- PASSO 2 — G1: RLS por papel nas tabelas COM organization_id.
--   SELECT: qualquer membro da organização dona da linha.
--   ALL:    membro com papel operacional (bloqueia viewer/motorista/não-membro).
-- Ajuste a lista de papéis de escrita conforme a operação real.
-- ---------------------------------------------------------------------------
do $$
declare
  g1 text[] := array['clients','suppliers','products','freights','deliveries','financial_titles'];
  t text;
begin
  foreach t in array g1 loop
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

-- ---------------------------------------------------------------------------
-- PASSO 3 — Carteiras: recria a RLS por papel SEM as dupes abertas que a anulavam.
-- (Mesma lógica da migration 202607070001, agora sem o wave_2_* using(true).)
-- ---------------------------------------------------------------------------
create policy rbac_read_negotiation_wallets on public.negotiation_wallets
  for select to authenticated
  using (exists (select 1 from public.organization_members om
    where om.organization_id = negotiation_wallets.organization_id and om.user_id = auth.uid()));
create policy rbac_manage_negotiation_wallets on public.negotiation_wallets
  for all to authenticated
  using (exists (select 1 from public.organization_members om
    where om.organization_id = negotiation_wallets.organization_id and om.user_id = auth.uid()
      and om.role in ('admin','gestor','financeiro')))
  with check (exists (select 1 from public.organization_members om
    where om.organization_id = negotiation_wallets.organization_id and om.user_id = auth.uid()
      and om.role in ('admin','gestor','financeiro')));

create policy rbac_read_wallet_entries on public.negotiation_wallet_entries
  for select to authenticated
  using (exists (select 1 from public.organization_members om
    where om.organization_id = negotiation_wallet_entries.organization_id and om.user_id = auth.uid()));
create policy rbac_insert_wallet_entries on public.negotiation_wallet_entries
  for insert to authenticated
  with check (exists (select 1 from public.organization_members om
    where om.organization_id = negotiation_wallet_entries.organization_id and om.user_id = auth.uid()
      and om.role in ('admin','gestor','financeiro','frota')));
create policy rbac_update_wallet_entries on public.negotiation_wallet_entries
  for update to authenticated
  using (exists (select 1 from public.organization_members om
    where om.organization_id = negotiation_wallet_entries.organization_id and om.user_id = auth.uid()
      and om.role in ('admin','gestor','financeiro')))
  with check (exists (select 1 from public.organization_members om
    where om.organization_id = negotiation_wallet_entries.organization_id and om.user_id = auth.uid()
      and om.role in ('admin','gestor','financeiro')));

-- ---------------------------------------------------------------------------
-- PASSO 4 — G2: tabelas SEM organization_id.
-- Aqui NÃO dá para isolar por organização ainda (falta a coluna). Para não travar
-- o app nem deixar 3 políticas abertas duplicadas, recriamos UMA única política de
-- autenticado por tabela. Isso NÃO melhora o isolamento — apenas remove a duplicação.
-- O isolamento real depende da decisão de produto no fim do arquivo.
-- ---------------------------------------------------------------------------
do $$
declare
  g2 text[] := array['simulations','orders','order_items','approvals',
                     'freight_documents','audit_events','notifications'];
  t text;
begin
  foreach t in array g2 loop
    execute format($p$
      create policy authenticated_all_%1$s on public.%1$s for all to authenticated
      using (true) with check (true);
    $p$, t);
  end loop;
end $$;

commit;

-- ============================================================================
-- DECISÃO DE PRODUTO PENDENTE (não incluída — exige mudança de schema):
--   Para isolar de verdade simulations/orders/order_items/approvals/
--   freight_documents, adicione `organization_id uuid` (com backfill) OU um
--   `owner_user_id uuid` estável, e então troque a política authenticated_all_*
--   por uma regra por organização/dono, espelhando src/lib/visibility.ts:
--     - gestor/aprovador/financeiro/admin da org: veem tudo da org;
--     - comercial: vê apenas os próprios registros (owner_user_id = auth.uid()).
--   freight_documents pode ser isolada via JOIN no pai freights (que tem
--   organization_id) assim que a coluna de FK for confirmada.
-- ============================================================================
