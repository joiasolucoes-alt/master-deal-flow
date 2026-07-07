-- Nome da alteração: Onda 2 - upload real de comprovantes/canhotos
-- Objetivo: permitir anexar arquivos de canhoto/comprovante no Supabase Storage.
-- Motivo: fechar a comprovação operacional da entrega com arquivo real, mantendo metadados na entrega.
-- Risco: médio-baixo; cria bucket privado e políticas simples para usuários autenticados.
-- Pode rodar em produção? Sim, após os SQLs 006, 009 e 010 estarem aplicados.
-- Como validar: abrir Entregas, concluir uma entrega, anexar PDF/JPG/PNG e abrir o arquivo salvo.
-- Reversão sugerida: remover as colunas adicionadas e apagar políticas/bucket se ainda não houver arquivo real.

alter table public.deliveries
  add column if not exists proof_file_path text,
  add column if not exists proof_file_size bigint,
  add column if not exists proof_mime_type text;

create index if not exists deliveries_proof_file_path_idx
  on public.deliveries(proof_file_path)
  where proof_file_path is not null;

insert into storage.buckets (id, name, public)
values ('delivery-proofs', 'delivery-proofs', false)
on conflict (id) do update set public = false;

drop policy if exists wave_2_delivery_proofs_select on storage.objects;
create policy wave_2_delivery_proofs_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'delivery-proofs');

drop policy if exists wave_2_delivery_proofs_insert on storage.objects;
create policy wave_2_delivery_proofs_insert
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'delivery-proofs');

drop policy if exists wave_2_delivery_proofs_update on storage.objects;
create policy wave_2_delivery_proofs_update
  on storage.objects for update
  to authenticated
  using (bucket_id = 'delivery-proofs')
  with check (bucket_id = 'delivery-proofs');
