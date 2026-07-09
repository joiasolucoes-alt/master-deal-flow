-- Nome da alteração: RLS por papel (substitui as políticas abertas da Onda 1.1)
-- Objetivo: Trocar as policies `using (true)` do 003_basic_rls_for_homologation por
--           políticas por organização + papel, no mesmo padrão já usado (e aprovado em
--           produção) na migration 202607070001_negotiation_wallets.sql.
-- Motivo: A RLS básica (qualquer autenticado lê/escreve tudo) é citada como pendência em
--         vários docs. Este script fecha essa dívida para as tabelas do fluxo comercial.
-- Risco: ALTO. RLS mal configurada pode travar acesso legítimo ou expor dados.
-- Pode rodar em produção? SOMENTE após revisão e teste em ambiente de preview.
--
-- ============================================================================
-- ⚠️ NÃO APLIQUE ESTE SCRIPT SEM ANTES LER docs/rls-refinement.md
-- ============================================================================
-- PRÉ-REQUISITOS (confirme ANTES de rodar):
--   1. TODAS as tabelas abaixo precisam ter a coluna `organization_id uuid`.
--      As tabelas das waves (financial_titles, freights, deliveries, freight_documents)
--      podem NÃO ter essa coluna dependendo da trilha de schema aplicada
--      (ver docs/schema-consolidation.md, Conflito 1). Verifique com:
--        select table_name from information_schema.columns
--         where column_name = 'organization_id'
--           and table_name in ('clients','suppliers','products','simulations',
--             'orders','financial_titles','freights','deliveries');
--      Se faltar em alguma, adicione a coluna e faça backfill ANTES, ou remova essa
--      tabela deste script e trate-a à parte.
--   2. `public.organization_members (organization_id, user_id, role)` deve existir e estar
--      populada — sem membros, a RLS bloqueia TUDO (comportamento desejado, mas exige
--      cadastrar os usuários primeiro).
-- Reversão: reaplicar 003_basic_rls_for_homologation.sql (restaura as policies abertas).
-- ============================================================================

-- Papéis com escrita ampla no fluxo comercial. Ajuste conforme a operação real.
-- (admin, gestor, aprovador, financeiro, comercial, frota) — mesmos valores de
-- organization_members.role. 'frota' corresponde ao perfil "Frete" do frontend.

-- Função utilitária local: membro da organização (leitura).
-- Espelha o padrão inline usado em 202607070001; não depende de sql/001.

-- ---------------------------------------------------------------------------
-- Padrão aplicado por tabela:
--   SELECT  -> qualquer membro da organização dona da linha
--   ALL     -> membros com papel operacional (write_roles)
-- Substitua os nomes wave_1_1_* antigos (as policies abertas) pelos rbac_*.
-- ---------------------------------------------------------------------------

do $$
declare
  read_tables text[] := array[
    'clients','suppliers','products',
    'simulations','simulation_items','simulation_costs',
    'simulation_purchase_costs','simulation_installments',
    'approvals','orders','order_items',
    'financial_titles','freights','deliveries','freight_documents',
    'audit_events','notifications'
  ];
  t text;
begin
  foreach t in array read_tables loop
    -- Garante RLS ligada.
    execute format('alter table public.%I enable row level security;', t);

    -- Remove as policies abertas da Onda 1.1, se existirem.
    execute format('drop policy if exists wave_1_1_read_%1$s on public.%1$s;', t);
    execute format('drop policy if exists wave_1_1_write_%1$s on public.%1$s;', t);
    execute format('drop policy if exists wave_1_1_insert_%1$s on public.%1$s;', t);

    -- Leitura: qualquer membro da organização dona da linha.
    execute format('drop policy if exists rbac_read_%1$s on public.%1$s;', t);
    execute format($p$
      create policy rbac_read_%1$s on public.%1$s for select to authenticated
      using (exists (
        select 1 from public.organization_members om
        where om.organization_id = %1$s.organization_id
          and om.user_id = auth.uid()
      ));
    $p$, t);

    -- Escrita: papéis operacionais da organização.
    execute format('drop policy if exists rbac_write_%1$s on public.%1$s;', t);
    execute format($p$
      create policy rbac_write_%1$s on public.%1$s for all to authenticated
      using (exists (
        select 1 from public.organization_members om
        where om.organization_id = %1$s.organization_id
          and om.user_id = auth.uid()
          and om.role in ('admin','gestor','aprovador','financeiro','comercial','frota')
      ))
      with check (exists (
        select 1 from public.organization_members om
        where om.organization_id = %1$s.organization_id
          and om.user_id = auth.uid()
          and om.role in ('admin','gestor','aprovador','financeiro','comercial','frota')
      ));
    $p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- PRÓXIMO NÍVEL (não incluído — decisão de produto): visibilidade por linha.
-- O frontend (src/lib/visibility.ts) já restringe Comercial a ver apenas seus
-- próprios registros. Para espelhar isso no banco, refine a policy rbac_read_*
-- das tabelas simulations/orders para algo como:
--   using (
--     exists (... membro admin/gestor/aprovador/financeiro da org ...)
--     or responsible_id = auth.uid()   -- ajuste ao nome real da coluna de dono
--   )
-- Confirme o nome da coluna de responsável em cada tabela antes.
-- ---------------------------------------------------------------------------
