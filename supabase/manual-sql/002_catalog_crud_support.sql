-- Nome da alteração: Suporte ao CRUD básico de cadastros
-- Objetivo: Garantir campos usados pelo frontend em clientes, fornecedores e produtos.
-- Motivo: A Onda 1.1 permite criar, editar e inativar clientes, fornecedores e produtos.
-- Risco: Baixo; script idempotente, sem DROP e sem apagar dados.
-- Pode rodar em produção? Sim
-- Dependências: Tabelas public.clients, public.suppliers e public.products já existentes.
-- Como validar: Criar/editar/inativar um cliente, fornecedor e produto pelo Master Flow.
-- Reversão sugerida: Não recomendada; os campos são aditivos. Se necessário, ocultar no app.

alter table public.clients
  add column if not exists external_id text,
  add column if not exists code text,
  add column if not exists document text,
  add column if not exists active boolean not null default true;

alter table public.suppliers
  add column if not exists external_id text,
  add column if not exists code text,
  add column if not exists document text,
  add column if not exists active boolean not null default true;

alter table public.products
  add column if not exists external_id text,
  add column if not exists name text,
  add column if not exists unit_label text,
  add column if not exists default_sale_unit numeric,
  add column if not exists active boolean not null default true;

create unique index if not exists clients_external_id_key
  on public.clients(external_id)
  where external_id is not null;

create unique index if not exists suppliers_external_id_key
  on public.suppliers(external_id)
  where external_id is not null;

create unique index if not exists products_external_id_key
  on public.products(external_id)
  where external_id is not null;

create index if not exists idx_clients_active_name on public.clients(active, name);
create index if not exists idx_suppliers_active_name on public.suppliers(active, name);
create index if not exists idx_products_active_description on public.products(active, description);
