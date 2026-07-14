-- Nome da alteração: Corrige o checklist e a ocorrência do motorista (colunas faltantes)
-- Objetivo: Fazer as RPCs driver_trip_event, driver_trip_occurrence e driver_proof_record
--           voltarem a gravar em public.freight_events e public.delivery_proofs sem erro 400.
-- Motivo: As RPCs inserem as colunas organization_id e order_id nessas duas tabelas, mas as
--         tabelas em produção NÃO possuem essas colunas. Resultado: HTTP 400 do PostgREST com
--         "42703: column \"organization_id\" of relation \"freight_events\" does not exist" ao
--         clicar em "Cheguei para carregar" e em "Registrar ocorrência".
-- Causa encontrada: public.freight_events e public.delivery_proofs foram criadas por um desenho
--         antigo do portal (supabase/sql/driver_public_tracking.sql) SEM organization_id/order_id.
--         A migration 202607070003 e o manual-sql 018 recriam as tabelas com essas colunas, mas
--         usando "create table if not exists" — como as tabelas já existiam, o comando foi um
--         no-op e as colunas nunca foram adicionadas. A tabela public.driver_access_links (criada
--         nova) já tem as duas colunas — por isso a GERAÇÃO do link funciona e só o checklist/
--         ocorrência/canhoto falham. As colunas organization_id/order_id fazem parte do modelo
--         (constam nas defs do repo e nas outras tabelas do portal), então a correção é ADICIONAR
--         as colunas — não remover das RPCs.
-- Risco: BAIXO. Colunas aditivas, nullable, sem FK (idênticas às defs do repo). freight_events e
--        delivery_proofs têm 0 linhas em produção — não há backfill. As RPCs não mudam.
-- Pode rodar em produção? Sim.
-- Dependências: 202607070003_driver_portal.sql (RPCs) e 027/028 já aplicados.
-- Como validar:
--   1) select column_name from information_schema.columns
--        where table_schema='public' and table_name='freight_events'
--          and column_name in ('organization_id','order_id');   -- deve retornar as 2
--   2) select column_name from information_schema.columns
--        where table_schema='public' and table_name='delivery_proofs'
--          and column_name in ('organization_id','order_id');   -- deve retornar as 2
--   3) No link do motorista: clicar "Cheguei para carregar" (sem erro 400), registrar uma
--      ocorrência e finalizar anexando o canhoto. Depois:
--      select event_type, occurrence_type, occurred_at from public.freight_events order by occurred_at;
-- Reversão sugerida (opcional, só se realmente necessário):
--   alter table public.freight_events drop column if exists organization_id;
--   alter table public.freight_events drop column if exists order_id;
--   alter table public.delivery_proofs drop column if exists organization_id;
--   alter table public.delivery_proofs drop column if exists order_id;

begin;

alter table public.freight_events add column if not exists organization_id uuid;
alter table public.freight_events add column if not exists order_id uuid;

alter table public.delivery_proofs add column if not exists organization_id uuid;
alter table public.delivery_proofs add column if not exists order_id uuid;

-- Conferência dentro da transação (deve listar as 4 linhas).
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('freight_events', 'delivery_proofs')
  and column_name in ('organization_id', 'order_id')
order by table_name, column_name;

commit;
