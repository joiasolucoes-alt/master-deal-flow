-- Driver public tracking for Fretes/Entregas.
-- Apply after the base Master Flow schema. Keeps RLS enabled and exposes public access only via RPC token validation.

create extension if not exists pgcrypto;

alter table public.freights
  add column if not exists carrier_name text,
  add column if not exists driver_name text,
  add column if not exists driver_phone text,
  add column if not exists vehicle_plate text,
  add column if not exists pickup_address text,
  add column if not exists pickup_city text,
  add column if not exists pickup_state text,
  add column if not exists delivery_address text,
  add column if not exists delivery_city text,
  add column if not exists delivery_state text,
  add column if not exists requires_proof boolean not null default true;

alter table public.freights drop constraint if exists freights_status_driver_tracking_check;
alter table public.freights add constraint freights_status_driver_tracking_check
  check (status in ('contracted','arrived_pickup','loaded','in_transit','delivered','completed','cancelled','Cotação','Aprovado','Em rota','Entregue'));

create table if not exists public.driver_tracking_links (
  id uuid primary key default gen_random_uuid(),
  freight_id uuid not null references public.freights(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.freight_events (
  id uuid primary key default gen_random_uuid(),
  freight_id uuid not null references public.freights(id) on delete cascade,
  event_type text not null check (event_type in ('arrived_pickup','loaded','in_transit','delivered','proof_uploaded')),
  event_label text not null,
  occurred_at timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (freight_id, event_type)
);

create table if not exists public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  freight_id uuid not null references public.freights(id) on delete cascade,
  event_id uuid references public.freight_events(id) on delete set null,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_driver_tracking_links_freight on public.driver_tracking_links(freight_id);
create index if not exists idx_freight_events_freight_time on public.freight_events(freight_id, occurred_at);
create index if not exists idx_delivery_proofs_freight on public.delivery_proofs(freight_id);

alter table public.driver_tracking_links enable row level security;
alter table public.freight_events enable row level security;
alter table public.delivery_proofs enable row level security;

insert into storage.buckets (id, name, public)
values ('delivery-proofs', 'delivery-proofs', false)
on conflict (id) do update set public = false;

create or replace function public.hash_driver_token(p_token text)
returns text language sql immutable strict as $$
  select encode(digest(p_token, 'sha256'), 'hex')
$$;

create or replace function public.get_driver_trip(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_link public.driver_tracking_links%rowtype;
  v_freight public.freights%rowtype;
  v_state text;
begin
  select * into v_link from public.driver_tracking_links where token_hash = public.hash_driver_token(p_token) limit 1;
  if not found then return null; end if;
  select * into v_freight from public.freights where id = v_link.freight_id;
  v_state := case when v_link.revoked_at is not null then 'revoked' when v_link.completed_at is not null or v_freight.status = 'completed' then 'completed' when v_link.expires_at < now() then 'expired' else 'active' end;
  update public.driver_tracking_links set used_at = coalesce(used_at, now()) where id = v_link.id;
  return jsonb_build_object(
    'freight_id', v_freight.id, 'carrier_name', v_freight.carrier_name, 'driver_name', v_freight.driver_name,
    'driver_phone', v_freight.driver_phone, 'vehicle_plate', v_freight.vehicle_plate,
    'pickup_address', coalesce(v_freight.pickup_address, ''), 'pickup_city', coalesce(v_freight.pickup_city, ''), 'pickup_state', coalesce(v_freight.pickup_state, ''),
    'delivery_address', coalesce(v_freight.delivery_address, ''), 'delivery_city', coalesce(v_freight.delivery_city, ''), 'delivery_state', coalesce(v_freight.delivery_state, ''),
    'status', v_freight.status, 'link_state', v_state, 'expires_at', v_link.expires_at, 'requires_proof', v_freight.requires_proof,
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at) from public.freight_events e where e.freight_id = v_freight.id), '[]'::jsonb),
    'proofs', coalesce((select jsonb_agg(to_jsonb(p) order by p.uploaded_at) from public.delivery_proofs p where p.freight_id = v_freight.id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.register_driver_event(p_token text, p_event_type text, p_latitude numeric default null, p_longitude numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.driver_tracking_links%rowtype;
  v_freight public.freights%rowtype;
  v_expected text;
  v_label text;
begin
  select * into v_link from public.driver_tracking_links where token_hash = public.hash_driver_token(p_token) limit 1;
  if not found or v_link.revoked_at is not null or v_link.completed_at is not null or v_link.expires_at < now() then raise exception 'driver link unavailable'; end if;
  select * into v_freight from public.freights where id = v_link.freight_id for update;
  if v_freight.status in ('completed','cancelled') then raise exception 'freight closed'; end if;
  v_expected := case when not exists (select 1 from public.freight_events where freight_id=v_freight.id and event_type='arrived_pickup') then 'arrived_pickup' when not exists (select 1 from public.freight_events where freight_id=v_freight.id and event_type='loaded') then 'loaded' when not exists (select 1 from public.freight_events where freight_id=v_freight.id and event_type='in_transit') then 'in_transit' when not exists (select 1 from public.freight_events where freight_id=v_freight.id and event_type='delivered') then 'delivered' when v_freight.requires_proof and not exists (select 1 from public.freight_events where freight_id=v_freight.id and event_type='proof_uploaded') then 'proof_uploaded' else null end;
  if p_event_type <> v_expected or p_event_type = 'proof_uploaded' then raise exception 'event out of order'; end if;
  v_label := case p_event_type when 'arrived_pickup' then 'Cheguei para coletar' when 'loaded' then 'Caminhão carregado' when 'in_transit' then 'Saiu para entrega / Em trânsito' when 'delivered' then 'Mercadoria entregue' end;
  insert into public.freight_events(freight_id,event_type,event_label,latitude,longitude) values (v_freight.id,p_event_type,v_label,p_latitude,p_longitude);
  update public.freights set status = p_event_type, updated_at = now() where id = v_freight.id;
  if p_event_type = 'delivered' and not v_freight.requires_proof then update public.freights set status='completed' where id=v_freight.id; update public.driver_tracking_links set completed_at=now() where id=v_link.id; end if;
  return public.get_driver_trip(p_token);
end;
$$;

create or replace function public.upload_delivery_proof(p_token text, p_file jsonb, p_latitude numeric default null, p_longitude numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_link public.driver_tracking_links%rowtype;
  v_freight public.freights%rowtype;
  v_event uuid;
  v_path text;
begin
  select * into v_link from public.driver_tracking_links where token_hash = public.hash_driver_token(p_token) limit 1;
  if not found or v_link.revoked_at is not null or v_link.completed_at is not null or v_link.expires_at < now() then raise exception 'driver link unavailable'; end if;
  select * into v_freight from public.freights where id = v_link.freight_id for update;
  if v_freight.status <> 'delivered' then raise exception 'proof requires delivered freight'; end if;
  if exists (select 1 from public.freight_events where freight_id = v_freight.id and event_type = 'proof_uploaded') then raise exception 'proof already uploaded'; end if;
  if (p_file->>'mime_type') not in ('image/jpeg','image/png','application/pdf') or coalesce((p_file->>'size')::bigint,0) > 8388608 then raise exception 'invalid proof file'; end if;
  v_path := v_freight.id || '/' || gen_random_uuid() || '-' || regexp_replace(coalesce(p_file->>'name','proof'), '[^a-zA-Z0-9._-]', '_', 'g');
  insert into storage.objects(bucket_id, name, owner, metadata)
  values ('delivery-proofs', v_path, null, jsonb_build_object('mimetype', p_file->>'mime_type', 'size', (p_file->>'size')::bigint));
  insert into public.freight_events(freight_id,event_type,event_label,latitude,longitude)
  values (v_freight.id,'proof_uploaded','Anexar comprovante assinado',p_latitude,p_longitude)
  returning id into v_event;
  insert into public.delivery_proofs(freight_id,event_id,file_path,file_name,mime_type,file_size)
  values (v_freight.id, v_event, v_path, p_file->>'name', p_file->>'mime_type', (p_file->>'size')::bigint);
  update public.freights set status = 'completed', updated_at = now() where id = v_freight.id;
  update public.driver_tracking_links set completed_at = now() where id = v_link.id;
  return public.get_driver_trip(p_token);
end;
$$;

create policy "Authenticated users can read driver links in their organization" on public.driver_tracking_links
  for select to authenticated using (exists (select 1 from public.freights f join public.organization_members om on om.organization_id = f.organization_id where f.id = freight_id and om.user_id = auth.uid()));
create policy "Authenticated users can read freight events in their organization" on public.freight_events
  for select to authenticated using (exists (select 1 from public.freights f join public.organization_members om on om.organization_id = f.organization_id where f.id = freight_id and om.user_id = auth.uid()));
create policy "Authenticated users can read delivery proofs in their organization" on public.delivery_proofs
  for select to authenticated using (exists (select 1 from public.freights f join public.organization_members om on om.organization_id = f.organization_id where f.id = freight_id and om.user_id = auth.uid()));
