-- Nome da alteração: Onda 3 - documentos de frete
-- Objetivo: permitir anexar contrato, proposta, nota/documento e outros arquivos ao frete.
-- Motivo: o frete precisa guardar evidências/documentos da contratação sem depender de arquivos soltos.
-- Risco: baixo; cria tabela nova e bucket novo, sem alterar dados existentes.
-- Pode rodar em produção? Sim, após conferir que o fluxo de fretes já está em uso.
-- Dependências: tabela public.freights e autenticação Supabase já configuradas.
-- Como validar: acessar Fretes, abrir um frete, anexar um PDF/JPG/PNG e abrir o arquivo salvo.
-- Reversão sugerida: remover a tabela public.freight_documents e o bucket freight-documents se ainda não houver uso real.

create table if not exists public.freight_documents (
  id uuid primary key default gen_random_uuid(),
  freight_external_id text not null,
  freight_code text,
  order_external_id text,
  order_number text,
  document_type text not null default 'other'
    check (document_type in ('contract','proposal','invoice','other')),
  file_name text not null,
  file_path text,
  mime_type text,
  file_size bigint,
  notes text,
  uploaded_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists freight_documents_freight_external_idx
  on public.freight_documents(freight_external_id);

create index if not exists freight_documents_order_external_idx
  on public.freight_documents(order_external_id)
  where order_external_id is not null;

create index if not exists freight_documents_type_idx
  on public.freight_documents(document_type);

alter table public.freight_documents enable row level security;

drop policy if exists wave_3_read_freight_documents on public.freight_documents;
create policy wave_3_read_freight_documents
  on public.freight_documents for select
  to authenticated
  using (true);

drop policy if exists wave_3_insert_freight_documents on public.freight_documents;
create policy wave_3_insert_freight_documents
  on public.freight_documents for insert
  to authenticated
  with check (true);

drop policy if exists wave_3_update_freight_documents on public.freight_documents;
create policy wave_3_update_freight_documents
  on public.freight_documents for update
  to authenticated
  using (true)
  with check (true);

insert into storage.buckets (id, name, public)
values ('freight-documents', 'freight-documents', false)
on conflict (id) do nothing;

drop policy if exists wave_3_freight_documents_select on storage.objects;
create policy wave_3_freight_documents_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'freight-documents');

drop policy if exists wave_3_freight_documents_insert on storage.objects;
create policy wave_3_freight_documents_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'freight-documents');

drop policy if exists wave_3_freight_documents_update on storage.objects;
create policy wave_3_freight_documents_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'freight-documents')
  with check (bucket_id = 'freight-documents');
