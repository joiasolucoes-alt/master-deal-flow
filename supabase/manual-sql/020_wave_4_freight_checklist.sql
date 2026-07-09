-- Nome da alteração: Onda 4 - checklist de fretes e conta a pagar do frete
-- Objetivo: guardar dados extras do frete (motorista, veículo, ANTT, tipo de carga)
--           e a data prevista de pagamento ao transportador, além de aceitar
--           os novos tipos de documento do checklist (motorista / veículo / operação).
-- Motivo: permitir bloqueio operacional por checklist e geração automática de
--          conta a pagar do frete no Financeiro.
-- Risco: baixo — apenas ALTER TABLE add column IF NOT EXISTS.
-- Pode rodar em produção? Sim.
-- Dependências: SQL 005 (freights) e SQL 015 (freight_documents).
-- Como validar: acessar Fretes, preencher motorista/veículo, anexar CNH e CRLV,
--               informar valor + data de pagamento e conferir se aparece um
--               título "PAG-FRETE" no Financeiro.

alter table public.freights add column if not exists carrier_document text;
alter table public.freights add column if not exists driver_cpf text;
alter table public.freights add column if not exists driver_phone text;
alter table public.freights add column if not exists driver_employment_type text
  check (driver_employment_type is null or driver_employment_type in ('autonomo','transportadora'));
alter table public.freights add column if not exists trailer_plate text;
alter table public.freights add column if not exists antt_registration text;
alter table public.freights add column if not exists cargo_type text default 'comum'
  check (cargo_type is null or cargo_type in ('comum','perigosa','refrigerada','excesso','rastreada'));
alter table public.freights add column if not exists freight_payment_due_date timestamptz;
alter table public.freights add column if not exists freight_payment_title_id text;

-- Liberar o check antigo de document_type (SQL 015 restringia a 4 valores).
alter table public.freight_documents drop constraint if exists freight_documents_document_type_check;

-- O app já valida o tipo. Deixamos sem check para permitir evoluir o catálogo
-- sem migrations adicionais.
