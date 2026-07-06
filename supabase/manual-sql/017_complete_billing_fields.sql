-- Nome da alteração: Onda 3 - faturamento completo
-- Objetivo: registrar NF, valor faturado, vencimento e responsável do faturamento.
-- Motivo: permitir que o Financeiro fature o pedido e libere para separação/frete.
-- Risco: baixo; adiciona apenas colunas opcionais em tabelas já existentes.
-- Pode rodar em produção? Sim, após conferir se os SQLs anteriores já foram aplicados.
-- Dependências: public.orders e public.financial_titles já criadas.
-- Como validar: acessar Financeiro, faturar um pedido e conferir o detalhe do pedido.
-- Reversão sugerida: remover as colunas adicionadas se ainda não houver uso real.

alter table public.orders
  add column if not exists invoice_number text,
  add column if not exists invoice_amount numeric(14,2),
  add column if not exists invoice_issued_at date,
  add column if not exists billing_due_date date,
  add column if not exists billing_notes text,
  add column if not exists billed_at timestamptz,
  add column if not exists billed_by text;

alter table public.financial_titles
  add column if not exists invoice_number text,
  add column if not exists invoice_issued_at date;

create index if not exists orders_invoice_number_idx
  on public.orders(invoice_number);

create index if not exists financial_titles_invoice_number_idx
  on public.financial_titles(invoice_number);
