-- ============================================================================
-- MasterFlow — Relatório de estado do banco (DIAGNÓSTICO, 100% READ-ONLY)
-- ============================================================================
-- Objetivo: fotografar o estado real do Supabase para tomar as decisões
--           levantadas em docs/schema-consolidation.md e docs/rls-refinement.md.
-- Seguro? SIM. Só SELECT e leitura de catálogo. Nenhum ALTER/INSERT/UPDATE/DROP.
-- Como usar: cole no SQL Editor do Supabase e rode. Cada seção (§) é independente;
--            pode rodar tudo de uma vez ou selecionar uma seção por vez.
-- ============================================================================


-- §1 ── Quais tabelas do fluxo existem? --------------------------------------
-- Mostra presença das tabelas contestadas + as do fluxo comercial.
select
  t.expected as tabela,
  case when c.relname is not null then 'EXISTE' else '--- ausente ---' end as status
from (values
  ('organizations'),('organization_members'),('units'),('profiles'),
  ('clients'),('suppliers'),('products'),
  ('negotiations'),('simulations'),('simulation_items'),('simulation_costs'),
  ('simulation_purchase_costs'),('simulation_installments'),
  ('approvals'),('orders'),('order_items'),
  ('financial_titles'),('freights'),('deliveries'),('freight_documents'),
  ('realized_results'),
  ('negotiation_wallets'),('negotiation_wallet_entries'),
  ('opportunity_pools'),('opportunity_pool_entries'),
  -- portais de motorista concorrentes (Conflito 2):
  ('driver_access_links'),('driver_access_attempts'),('freight_events'),
  ('delivery_proofs'),('driver_tracking_links'),
  -- estruturas exclusivas da trilha alternativa sql/001 (Conflito 1):
  ('simulation_expenses'),('purchase_components'),('simulation_approvals'),
  ('order_status_events'),('documents'),('document_sequences')
) as t(expected)
left join pg_class c on c.relname = t.expected
  and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
order by status desc, tabela;


-- §2 ── Qual trilha de schema está viva? (Conflito 1) ------------------------
-- Se financial_titles/freights/deliveries têm 'external_id'/'unit_name' => trilha A (waves).
-- Se têm 'organization_id' NOT NULL e faltam os campos de checklist => trilha B (sql/001).
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('financial_titles','freights','deliveries','freight_documents')
order by table_name, ordinal_position;


-- §3 ── organization_id existe onde a RLS 021 precisa? (pré-requisito) --------
-- A RLS por papel do manual-sql/021 exige organization_id em cada tabela abaixo.
select t.table_name,
  bool_or(c.column_name = 'organization_id') as tem_organization_id
from (values
  ('clients'),('suppliers'),('products'),('simulations'),('orders'),
  ('financial_titles'),('freights'),('deliveries'),('freight_documents'),
  ('approvals'),('order_items'),('audit_events'),('notifications')
) as t(table_name)
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = t.table_name
group by t.table_name
order by tem_organization_id, t.table_name;


-- §4 ── Constraint de status de freights (Conflito 3) ------------------------
-- Mostra o conjunto de valores aceitos hoje na coluna status.
select con.conname as constraint_name,
       pg_get_constraintdef(con.oid) as definicao
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
where rel.relnamespace = 'public'::regnamespace
  and rel.relname = 'freights'
  and con.contype = 'c'
order by con.conname;


-- §5 ── Estado da RLS por tabela (rls-refinement) ----------------------------
-- rls_enabled = a trava está ligada? Se ligada mas sem policy, bloqueia tudo.
select c.relname as tabela, c.relrowsecurity as rls_ligada
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  and c.relname in (
    'clients','suppliers','products','simulations','orders',
    'financial_titles','freights','deliveries','freight_documents',
    'approvals','order_items','audit_events','notifications',
    'negotiation_wallets','negotiation_wallet_entries'
  )
order by c.relname;


-- §6 ── Policies existentes (aberta 'true' x por papel?) ---------------------
-- Olhe a coluna "qual": se aparece só "true", a policy é aberta (Onda 1.1).
-- Se referencia organization_members/has_role, já é por papel.
select tablename as tabela, policyname as policy, cmd as comando,
       coalesce(qual, '(sem using)') as using_expr,
       coalesce(with_check, '(sem check)') as with_check_expr
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- §7 ── organization_members está populada? Quais papéis? --------------------
-- Sem membros, a RLS por papel bloqueia tudo. Confirme antes de aplicar a 021.
do $$
declare r record;
begin
  if to_regclass('public.organization_members') is null then
    raise notice 'organization_members: (tabela nao existe)';
  else
    for r in
      select role, count(*) as n
      from public.organization_members
      group by role order by 2 desc
    loop
      raise notice 'papel % : % membro(s)', r.role, r.n;
    end loop;
  end if;
end $$;


-- §8 ── Contagem de linhas nas tabelas-chave (tolera tabela ausente) ---------
do $$
declare t text; n bigint;
begin
  foreach t in array array[
    'organization_members','clients','suppliers','products',
    'simulations','orders','financial_titles','freights','deliveries',
    'realized_results','negotiation_wallets','driver_access_links'
  ] loop
    if to_regclass('public.'||t) is null then
      raise notice '% : (nao existe)', t;
    else
      execute format('select count(*) from public.%I', t) into n;
      raise notice '% : % linha(s)', t, n;
    end if;
  end loop;
end $$;


-- §9 ── Funções/RPCs presentes (auth, RLS helpers, portal do motorista) ------
select p.proname as funcao,
       pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'has_role','is_member_of_organization','can_access_unit',
    'get_my_master_flow_context','register_current_user_as_comercial',
    'next_document_code',
    'driver_link_auth','driver_trip_status','driver_trip_event','driver_proof_record'
  )
order by p.proname;


-- §10 ── Buckets de Storage (uploads de comprovante/documento) ---------------
-- Esperados: delivery-proofs, freight-documents (e master-flow-documents na trilha B).
select id, name, public as publico
from storage.buckets
order by name;


-- ============================================================================
-- COMO LER O RESULTADO (resumo)
-- ----------------------------------------------------------------------------
--  §2  colunas de freights: viu 'external_id'/'unit_name'? => trilha A (alinhada
--      ao frontend, recomendada). Só 'organization_id' e sem checklist? => trilha B.
--  §3  alguma tabela com tem_organization_id = false? => NÃO aplique a 021 nela
--      sem antes adicionar a coluna (ver docs/schema-consolidation.md, Conflito 1).
--  §4  valores em português + inglês misturados => alinhar ao FreightStatus do
--      frontend (docs/schema-consolidation.md, Conflito 3).
--  §5/§6  policies só com "true" => RLS aberta; migrar via manual-sql/021.
--  §7  papéis existentes: confira se há 'frota' (perfil Frete) cadastrado.
--  §1  driver_tracking_links presente => resquício do portal antigo (Conflito 2).
-- ============================================================================
