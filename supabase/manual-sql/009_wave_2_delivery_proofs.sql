-- Nome da alteração: Onda 2 - comprovantes/canhotos de entrega
-- Objetivo: permitir registrar dados do canhoto/comprovante diretamente na entrega.
-- Motivo: fechar a conferência operacional depois que a mercadoria é entregue.
-- Risco: baixo; adiciona apenas colunas opcionais na tabela deliveries.
-- Pode rodar em produção? Sim, após o SQL 006_wave_2_deliveries.sql estar aplicado.
-- Como validar: abrir Entregas, concluir uma entrega e registrar o canhoto.
-- Reversão sugerida: remover as colunas adicionadas se ainda não houver uso real.

alter table public.deliveries
  add column if not exists proof_document_number text,
  add column if not exists proof_file_name text,
  add column if not exists proof_received_by text,
  add column if not exists proof_registered_at timestamptz;

create index if not exists deliveries_proof_registered_idx
  on public.deliveries(proof_registered_at)
  where proof_registered_at is not null;
