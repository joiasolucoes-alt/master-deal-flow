-- Nome da alteração: Verificação (somente leitura) da preparação de frete
-- Objetivo: Confirmar que a nova regra "SIM aprovada visível para o Frete como
--           preparação" NÃO exige mudança de schema — e conferir os fretes de
--           preparação (sem pedido vinculado) já persistidos.
-- Motivo: A feature "expose approved simulations to freight preparation" reutiliza
--         estruturas existentes: o frete de preparação é gravado em `public.freights`
--         sem vínculo com pedido e as notificações por papel (Financeiro/Frete/
--         Comercial) e a auditoria acontecem na aplicação e nas funções já existentes.
--         Nenhuma tabela/coluna nova é necessária.
-- IMPORTANTE: o app NÃO grava a coluna uuid `order_id` (ela fica sempre nula). O
--         vínculo do frete com o pedido é gravado em `order_external_id` (texto),
--         que casa com o id externo do pedido (ex.: `ord-...`). Portanto o indicador
--         de "preparação" é `order_external_id IS NULL`, não `order_id IS NULL`.
-- Risco: NENHUM. Este arquivo contém apenas SELECTs (nenhum INSERT/UPDATE/DDL).
-- Pode rodar em produção? Sim (somente leitura).
-- Dependências: 005_wave_2_freights.sql aplicado (tabela `freights` com
--         `order_external_id`). Nada além disso.
-- Como validar: rode os SELECTs abaixo. A consulta 2 deve listar apenas fretes de
--         preparação (external_id começando com `freight-sim-`, sem pedido). A
--         consulta 3 mostra fretes já vinculados a um pedido ainda não liberado.
-- Reversão sugerida: não se aplica (somente leitura).

-- 1) Confirma que as colunas de vínculo com pedido são NULLABLE.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'freights'
  and column_name in ('order_id', 'order_external_id')
order by column_name;

-- 2) Fretes de "preparação": SEM pedido vinculado (order_external_id nulo).
--    São as simulações aprovadas pelo Gestor que ainda não viraram pedido.
select
  f.external_id,
  f.code,
  f.client_name,
  f.route,
  f.status,
  f.order_external_id,
  f.created_at
from public.freights f
where f.order_external_id is null
order by f.created_at desc;

-- 3) Fretes JÁ vinculados a um pedido, mas com o pedido ainda NÃO liberado
--    (continuam bloqueados para execução). O join usa o id externo do pedido.
select
  f.code,
  f.status as freight_status,
  o.number as order_number,
  o.status as order_status
from public.freights f
join public.orders o on o.external_id = f.order_external_id
where o.status not in ('Frete liberado', 'Aguardando frete', 'Em separação', 'Em rota', 'Entregue')
order by o.created_at desc;
