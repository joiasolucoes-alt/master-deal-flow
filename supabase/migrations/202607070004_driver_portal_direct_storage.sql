insert into storage.buckets (id, name, public)
values ('delivery-proofs', 'delivery-proofs', false)
on conflict (id) do nothing;

drop policy if exists delivery_proofs_driver_upload_insert on storage.objects;
create policy delivery_proofs_driver_upload_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'delivery-proofs');

