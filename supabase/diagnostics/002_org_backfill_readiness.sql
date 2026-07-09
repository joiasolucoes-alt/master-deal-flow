-- ============================================================================
-- MasterFlow — Prontidão para backfill de organization_id (READ-ONLY)
-- ============================================================================
-- Responde o que falta saber antes de rodar manual-sql/023:
--   • Quantas organizações existem? (1 => backfill trivial)
--   • units.organization_id / profiles.auth_user_id existem? (caminhos alternativos)
--   • simulations/orders já têm a coluna? Quantas linhas? unit_id/responsible_id nulos?
-- 100% read-only. Rode sozinho no SQL Editor; devolve UMA tabela.
-- ============================================================================
select * from (

  select '1. organizacoes'::text as secao,
         'total de linhas em public.organizations'::text as item,
         (select count(*)::text from public.organizations) as detalhe

  union all
  select '2. colunas de apoio'::text,
         (m.tbl || '.' || m.col)::text,
         case when exists (
           select 1 from information_schema.columns c
           where c.table_schema='public' and c.table_name=m.tbl and c.column_name=m.col
         ) then 'EXISTE' else 'ausente' end::text
  from (values
    ('units','organization_id'),
    ('profiles','auth_user_id'),
    ('profiles','organization_id'),
    ('simulations','organization_id'),
    ('orders','organization_id'),
    ('order_items','organization_id'),
    ('approvals','organization_id')
  ) as m(tbl,col)

  union all
  -- Volume e completude das colunas de derivação (para escolher o caminho)
  select '3. volume/nulos'::text, x.item::text, x.detalhe::text
  from (
    select 'simulations: total' as item, count(*)::text as detalhe from public.simulations
    union all select 'simulations: unit_id nulo',
      count(*) filter (where unit_id is null)::text from public.simulations
    union all select 'simulations: responsible_id nulo',
      count(*) filter (where responsible_id is null)::text from public.simulations
    union all select 'orders: total', count(*)::text from public.orders
    union all select 'orders: unit_id nulo',
      count(*) filter (where unit_id is null)::text from public.orders
    union all select 'orders: responsible_id nulo',
      count(*) filter (where responsible_id is null)::text from public.orders
  ) x

) relatorio
order by secao, item;

-- COMO LER:
--  §1 = 1  -> rode o 023 no CAMINHO PADRÃO (organização única). Simples e seguro.
--  §1 > 1  -> use o bloco multi-org do 023; exige units.organization_id (§2) EXISTE.
--  §2 units.organization_id ausente + §1 > 1 -> me avise: derivamos a org de outra
--            fonte (freights/financial_titles já têm organization_id populado).
