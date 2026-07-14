-- Denormaliza nome do cliente e do responsável na tabela de negociações,
-- espelhando o padrão já usado em `simulations` e `orders` (que carregam
-- `client_name`/`responsible_name` porque `client_id`/`responsible_id` ficam nulos).
-- Habilita a lente de insights por Negócio/Cliente a exibir os nomes sem joins.

alter table public.negotiations
  add column if not exists client_name text,
  add column if not exists responsible_name text;
