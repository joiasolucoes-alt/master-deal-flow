-- Nome da alteração: ROLLBACK da RLS por papel (021/024/025)
-- Objetivo: Voltar as tabelas para políticas ABERTAS (leitura+escrita a autenticados),
--           revertendo a RLS por organização que foi aplicada e depois revertida em prod.
-- Motivo: A RLS por papel (021/024/025) quebrou a CRIAÇÃO de registros em produção.
--         O app não grava `organization_id` no INSERT (a coluna não existia quando o app
--         foi escrito), então o `with check` das políticas rejeitava as gravações — novas
--         simulações/pedidos/etc. não eram salvas. Revertido para restaurar a operação.
-- Aplicado em produção: 2026-07-09 (via MCP), após aprovação do usuário.
-- Risco: BAIXO. Restaura o estado aberto anterior. App volta a funcionar 100%.
--
-- O que foi MANTIDO (não faz parte da RLS, é seguro):
--   • 022 (constraint canônica de freights.status).
--   • As colunas organization_id adicionadas em simulations/orders/order_items/approvals/
--     negotiations (aditivas, inofensivas; úteis quando a RLS for refeita corretamente).
--
-- CAMINHO CORRETO PARA REFAZER A RLS NO FUTURO (pré-requisito):
--   1. Fazer o APP gravar organization_id em todo INSERT (repositórios em
--      src/features/*/repositories/*.ts) OU instalar um trigger BEFORE INSERT que
--      preencha organization_id a partir de organization_members do usuário.
--   2. SÓ ENTÃO reaplicar 021/024/025. Sem isso, a RLS volta a travar as gravações.

begin;
do $$
declare
  tabelas text[] := array[
    'clients','suppliers','products','freights','deliveries','financial_titles',
    'negotiation_wallets','negotiation_wallet_entries',
    'simulations','orders','order_items','approvals',
    'simulation_items','simulation_costs','simulation_purchase_costs','simulation_installments',
    'realized_results','negotiations','units','profiles'
  ];
  pol record; t text;
begin
  for pol in select policyname, tablename from pg_policies
    where schemaname='public' and tablename = any(tabelas)
  loop
    execute format('drop policy if exists %I on public.%I;', pol.policyname, pol.tablename);
  end loop;
  foreach t in array tabelas loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy authenticated_all_%1$s on public.%1$s for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
commit;
