-- Nome da alteração: Verificação (somente leitura) da preparação de frete
-- Objetivo: Confirmar que a nova regra "SIM aprovada visível para o Frete como
--           preparação" NÃO exige mudança de schema — e conferir os fretes de
--           preparação (sem pedido vinculado) já persistidos.
-- Motivo: A feature "expose approved simulations to freight preparation" reutiliza
--         estruturas existentes: o frete de preparação é gravado em `public.freights`
--         com `order_id NULL` (coluna já nullable) e as notificações por papel
--         (Financeiro/Frete/Comercial) e a auditoria acontecem na aplicação e nas
--         funções já existentes. Nenhuma tabela/coluna nova é necessária.
-- Risco: NENHUM. Este arquivo contém apenas SELECTs (nenhum INSERT/UPDATE/DDL).
-- Pode rodar em produção? Sim (somente leitura).
-- Dependências: 005_wave_2_freights.sql aplicado (tabela `freights` com `order_id`
--         uuid NULL references orders(id)). Nada além disso.
-- Como validar: rode os SELECTs abaixo. O primeiro deve mostrar is_nullable = 'YES'
--         para freights.order_id. O segundo lista as operações em preparação
--         (order_id nulo) — devem ser exatamente as simulações aprovadas pelo Gestor
--         que ainda não viraram pedido.
-- Reversão sugerida: não se aplica (somente leitura).

-- 1) Confirma que freights.order_id é NULLABLE (pré-requisito da preparação).
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'freights'
  and column_name = 'order_id';

-- 2) Lista os fretes de "preparação" (ainda não vinculados a um pedido).
select
  f.external_id,
  f.code,
  f.client_name,
  f.route,
  f.status,
  f.order_id,
  f.created_at
from public.freights f
where f.order_id is null
order by f.created_at desc;

-- 3) (Opcional) Confere que fretes vinculados a pedidos NÃO liberados continuam
--    bloqueados para execução — ou seja, o pedido ainda não está em um status de
--    liberação de frete.
select
  f.code,
  f.status as freight_status,
  o.number as order_number,
  o.status as order_status
from public.freights f
join public.orders o on o.id = f.order_id
where o.status not in ('Frete liberado', 'Aguardando frete', 'Em separação', 'Em rota', 'Entregue')
order by o.created_at desc;
