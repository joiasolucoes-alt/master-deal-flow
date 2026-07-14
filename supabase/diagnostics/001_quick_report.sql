-- ============================================================================
-- MasterFlow — Relatório rápido (READ-ONLY, resultado ÚNICO)
-- ============================================================================
-- Rode esta query sozinha no SQL Editor. Ela devolve UMA tabela com 4 blocos
-- (A, B, C, D). Não usa DO/RAISE (que não aparece em Results). 100% read-only.
-- ============================================================================
select * from (

  -- A. Marcadores de trilha de schema (Conflito 1) -------------------------
  -- EXISTE em external_id/driver_cpf/cargo_type/proof_file_path/simulation_external_id
  --   => trilha A (waves, alinhada ao frontend).
  -- Só organization_id EXISTE e os demais ausentes => trilha B (sql/001).
  select 'A. trilha (marcadores)'::text as secao,
         (m.tbl || '.' || m.col)::text  as item,
         case when exists (
           select 1 from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = m.tbl
             and c.column_name = m.col
         ) then 'EXISTE' else 'ausente' end::text as detalhe
  from (values
    ('freights','external_id'),('freights','order_external_id'),
    ('freights','organization_id'),('freights','driver_cpf'),('freights','cargo_type'),
    ('deliveries','external_id'),('deliveries','organization_id'),('deliveries','proof_file_path'),
    ('financial_titles','external_id'),('financial_titles','organization_id'),
    ('financial_titles','simulation_external_id')
  ) as m(tbl,col)

  union all

  -- B. organization_id presente onde a RLS 021 precisa (pré-requisito) ------
  select 'B. organization_id'::text,
         t.table_name::text,
         case when exists (
           select 1 from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = t.table_name
             and c.column_name = 'organization_id'
         ) then 'SIM' else 'NAO' end::text
  from (values
    ('clients'),('suppliers'),('products'),('simulations'),('orders'),
    ('financial_titles'),('freights'),('deliveries'),('freight_documents'),
    ('approvals'),('order_items'),('audit_events'),('notifications')
  ) as t(table_name)

  union all

  -- C. Policies: abertas ('true') ou por papel? (rls-refinement) ------------
  select 'C. policies'::text,
         (p.tablename || ' / ' || p.policyname)::text,
         (p.cmd || ' | using=' || left(coalesce(p.qual,'-'), 60))::text
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (
      'clients','suppliers','products','simulations','orders',
      'financial_titles','freights','deliveries','freight_documents',
      'approvals','order_items','audit_events','notifications',
      'negotiation_wallets','negotiation_wallet_entries'
    )

  union all

  -- D. Constraint de status de freights (Conflito 3) -----------------------
  select 'D. freights.status'::text,
         con.conname::text,
         pg_get_constraintdef(con.oid)::text
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relnamespace = 'public'::regnamespace
    and rel.relname = 'freights' and con.contype = 'c'

) relatorio
order by secao, item;
