-- Nome da alteração: Onda 2 - histórico detalhado de ocorrências de entrega
-- Objetivo: permitir que uma entrega tenha múltiplas ocorrências com data, tipo, local, responsável e descrição.
-- Motivo: melhorar a rastreabilidade operacional depois do pedido, sem depender de observação única.
-- Risco: baixo; adiciona apenas uma coluna JSON opcional na tabela deliveries.
-- Pode rodar em produção? Sim, após o SQL 006_wave_2_deliveries.sql estar aplicado.
-- Como validar: abrir Entregas, registrar mais de uma ocorrência e conferir o histórico no card.
-- Reversão sugerida: remover a coluna occurrence_history se ainda não houver uso real.

alter table public.deliveries
  add column if not exists occurrence_history jsonb not null default '[]'::jsonb;

create index if not exists deliveries_occurrence_history_gin_idx
  on public.deliveries using gin (occurrence_history);
