-- Nome da alteração: Remover a constraint de status de freights redundante/enganosa
-- Objetivo: Deixar UMA única CHECK em freights.status, alinhada ao FreightStatus do frontend.
-- Motivo: O diagnóstico mostrou DUAS CHECK convivendo na coluna status:
--           • freights_status_check                -> 6 valores canônicos (quoted..cancelled)
--           • freights_status_driver_tracking_check -> união gigante (PT + EN + eventos)
--         CHECKs são combinadas com E (AND), então o conjunto EFETIVO já é a interseção =
--         os 6 valores canônicos. A constraint gigante NUNCA é a que decide; ela só engana,
--         sugerindo que valores como 'Em rota' ou 'arrived_loading' são aceitos (não são).
-- Risco: BAIXO. Nenhuma linha existente pode ter valor fora dos 6 (a outra CHECK já barra),
--        então o DROP não viola dados. Nenhuma mudança de comportamento para o app.
-- Pode rodar em produção? Sim, com validação prévia.
-- Dependências: 005_wave_2_freights.sql, 007_fix_freight_status_constraint.sql.
-- Reversão: recriar a constraint antiga (não recomendado — ver docs/schema-consolidation.md).

begin;

-- Remove a constraint redundante/enganosa (a de união gigante).
alter table public.freights
  drop constraint if exists freights_status_driver_tracking_check;

-- Garante que a constraint canônica existe e reflete exatamente o FreightStatus do
-- frontend (src/features/freights/freightHelpers.ts). Recria de forma idempotente.
alter table public.freights
  drop constraint if exists freights_status_check;
alter table public.freights
  add constraint freights_status_check
  check (status in ('quoted','hired','loading','in_route','delivered','cancelled'));

commit;

-- Observação: os eventos do motorista (arrived_loading, in_transit, unloaded, completed…)
-- NÃO são gravados em freights.status — vão para a tabela de eventos do portal
-- (freight_events). Por isso a lista canônica acima é suficiente. Se algum dia o app
-- passar a persistir esses estados diretamente em freights.status, amplie ESTA constraint
-- (freights_status_check) — nunca recrie uma segunda CHECK concorrente.
