-- Nome da alteração: Portal temporário do motorista
-- Objetivo: gerar acesso externo temporário com token + PIN para atualização de entrega.
-- Como validar: gerar acesso em Fretes, abrir /motorista/:token em aba anônima e registrar etapas.
-- Observação: o token/PIN puro aparece somente no momento da geração; no banco ficam hashes.

create extension if not exists pgcrypto;

alter table public.freights
  add column if not exists driver_phone text,
  add column if not exists pickup_address text,
  add column if not exists pickup_city text,
  add column if not exists pickup_state text,
  add column if not exists delivery_address text,
  add column if not exists delivery_city text,
  add column if not exists delivery_state text,
  add column if not exists requires_proof boolean not null default true;

alter table public.freights drop constraint if exists freights_status_driver_tracking_check;
alter table public.freights drop constraint if exists freights_status_check;
alter table public.freights add constraint freights_status_driver_tracking_check
  check (status in (
    'quoted', 'hired', 'loading', 'in_route', 'delivered', 'cancelled',
    'arrived_loading', 'in_transit', 'arrived_delivery_location',
    'unloaded', 'proof_uploaded', 'completed',
    'contracted', 'arrived_pickup', 'loaded',
    'Cotação', 'Aprovado', 'Em rota', 'Entregue'
  ));

create table if not exists public.driver_access_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  freight_id uuid not null references public.freights(id) on delete cascade,
  order_id uuid,
  token_hash text not null unique,
  pin_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unlocked_at timestamptz,
  completed_at timestamptz,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_access_attempts (
  id uuid primary key default gen_random_uuid(),
  driver_access_link_id uuid references public.driver_access_links(id) on delete cascade,
  freight_id uuid references public.freights(id) on delete cascade,
  success boolean not null default false,
  reason text not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.freight_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  freight_id uuid not null references public.freights(id) on delete cascade,
  order_id uuid,
  event_type text not null check (event_type in (
    'arrived_loading',
    'in_transit',
    'arrived_delivery_location',
    'unloaded',
    'proof_uploaded',
    'completed'
  )),
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
  organization_id uuid,
  freight_id uuid not null references public.freights(id) on delete cascade,
  order_id uuid,
  event_id uuid references public.freight_events(id) on delete set null,
  file_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists driver_access_links_freight_idx on public.driver_access_links(freight_id);
create index if not exists driver_access_links_token_idx on public.driver_access_links(token_hash);
create index if not exists driver_access_attempts_link_idx on public.driver_access_attempts(driver_access_link_id, created_at);
create index if not exists freight_events_freight_time_idx on public.freight_events(freight_id, occurred_at);
create index if not exists delivery_proofs_freight_idx on public.delivery_proofs(freight_id);

alter table public.driver_access_links enable row level security;
alter table public.driver_access_attempts enable row level security;
alter table public.freight_events enable row level security;
alter table public.delivery_proofs enable row level security;

insert into storage.buckets (id, name, public)
values ('delivery-proofs', 'delivery-proofs', false)
on conflict (id) do update set public = false;

create or replace function public.hash_driver_secret(p_value text)
returns text language sql immutable strict as $$
  select encode(digest(p_value, 'sha256'), 'hex')
$$;

create or replace function public.driver_event_label(p_event_type text)
returns text language sql immutable strict as $$
  select case p_event_type
    when 'arrived_loading' then 'Cheguei para carregar'
    when 'in_transit' then 'Estou em trânsito'
    when 'arrived_delivery_location' then 'Cheguei no destino'
    when 'unloaded' then 'Descarreguei a mercadoria'
    when 'proof_uploaded' then 'Comprovante enviado'
    when 'completed' then 'Entrega concluída'
    else p_event_type
  end
$$;

create or replace function public.driver_next_event(p_freight_id uuid)
returns text language plpgsql stable as $$
begin
  if not exists (select 1 from public.freight_events where freight_id = p_freight_id and event_type = 'arrived_loading') then
    return 'arrived_loading';
  elsif not exists (select 1 from public.freight_events where freight_id = p_freight_id and event_type = 'in_transit') then
    return 'in_transit';
  elsif not exists (select 1 from public.freight_events where freight_id = p_freight_id and event_type = 'arrived_delivery_location') then
    return 'arrived_delivery_location';
  elsif not exists (select 1 from public.freight_events where freight_id = p_freight_id and event_type = 'unloaded') then
    return 'unloaded';
  elsif not exists (select 1 from public.freight_events where freight_id = p_freight_id and event_type = 'proof_uploaded') then
    return 'proof_uploaded';
  elsif not exists (select 1 from public.freight_events where freight_id = p_freight_id and event_type = 'completed') then
    return 'completed';
  end if;
  return null;
end;
$$;

create or replace function public.create_driver_access_link(
  p_freight_external_id text,
  p_order_external_id text,
  p_token text,
  p_pin text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_freight public.freights%rowtype;
  v_order_id uuid;
  v_link public.driver_access_links%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_freight from public.freights where external_id = p_freight_external_id or id::text = p_freight_external_id limit 1;
  if not found then raise exception 'freight not found'; end if;

  select id into v_order_id from public.orders where external_id = p_order_external_id or id::text = p_order_external_id limit 1;

  update public.driver_access_links
     set revoked_at = now(), updated_at = now()
   where freight_id = v_freight.id and completed_at is null and revoked_at is null;

  insert into public.driver_access_links(
    organization_id, freight_id, order_id, token_hash, pin_hash, expires_at, created_by
  )
  values (
    v_freight.organization_id,
    v_freight.id,
    v_order_id,
    public.hash_driver_secret(p_token),
    public.hash_driver_secret(p_pin),
    p_expires_at,
    auth.uid()
  )
  returning * into v_link;

  return jsonb_build_object(
    'id', v_link.id,
    'freight_id', v_freight.external_id,
    'expires_at', v_link.expires_at,
    'revoked_at', v_link.revoked_at,
    'failed_attempts', v_link.failed_attempts
  );
end;
$$;

create or replace function public.revoke_driver_access_link(p_freight_external_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_freight_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select id into v_freight_id from public.freights where external_id = p_freight_external_id or id::text = p_freight_external_id limit 1;
  if v_freight_id is null then raise exception 'freight not found'; end if;
  update public.driver_access_links
     set revoked_at = now(), updated_at = now()
   where freight_id = v_freight_id and revoked_at is null and completed_at is null;
end;
$$;

create or replace function public.driver_public_payload(v_link public.driver_access_links, v_freight public.freights)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'freight_id', v_freight.external_id,
    'carrier_name', v_freight.carrier_name,
    'driver_name', v_freight.driver_name,
    'driver_phone', v_freight.driver_phone,
    'vehicle_plate', v_freight.vehicle_plate,
    'pickup_address', coalesce(v_freight.pickup_address, split_part(v_freight.route, '→', 1), ''),
    'pickup_city', coalesce(v_freight.pickup_city, ''),
    'pickup_state', coalesce(v_freight.pickup_state, ''),
    'delivery_address', coalesce(v_freight.delivery_address, split_part(v_freight.route, '→', 2), ''),
    'delivery_city', coalesce(v_freight.delivery_city, ''),
    'delivery_state', coalesce(v_freight.delivery_state, ''),
    'status', v_freight.status,
    'link_state',
      case
        when v_link.revoked_at is not null then 'revoked'
        when v_link.completed_at is not null or v_freight.status = 'completed' then 'completed'
        when v_link.locked_until is not null and v_link.locked_until > now() then 'locked'
        when v_link.expires_at < now() then 'expired'
        else 'active'
      end,
    'expires_at', v_link.expires_at,
    'locked_until', v_link.locked_until,
    'failed_attempts', v_link.failed_attempts,
    'requires_proof', coalesce(v_freight.requires_proof, true),
    'next_event', public.driver_next_event(v_freight.id),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.occurred_at)
      from public.freight_events e
      where e.freight_id = v_freight.id
    ), '[]'::jsonb),
    'proofs', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.uploaded_at)
      from public.delivery_proofs p
      where p.freight_id = v_freight.id
    ), '[]'::jsonb)
  )
$$;

create or replace function public.driver_link_auth(
  p_token text,
  p_pin text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.driver_access_links%rowtype;
  v_freight public.freights%rowtype;
  v_reason text;
begin
  select * into v_link from public.driver_access_links where token_hash = public.hash_driver_secret(p_token) limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'invalid_link'); end if;

  select * into v_freight from public.freights where id = v_link.freight_id;

  if v_link.revoked_at is not null then v_reason := 'revoked';
  elsif v_link.completed_at is not null then v_reason := 'completed';
  elsif v_link.expires_at < now() then v_reason := 'expired';
  elsif v_link.locked_until is not null and v_link.locked_until > now() then v_reason := 'locked';
  elsif v_link.pin_hash <> public.hash_driver_secret(p_pin) then v_reason := 'invalid_pin';
  else v_reason := 'ok';
  end if;

  insert into public.driver_access_attempts(driver_access_link_id, freight_id, success, reason, user_agent)
  values (v_link.id, v_link.freight_id, v_reason = 'ok', v_reason, p_user_agent);

  if v_reason = 'invalid_pin' then
    update public.driver_access_links
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end,
           updated_at = now()
     where id = v_link.id
     returning * into v_link;
    return jsonb_build_object(
      'ok', false,
      'reason', case when v_link.locked_until is not null and v_link.locked_until > now() then 'locked' else 'invalid_pin' end,
      'locked_until', v_link.locked_until,
      'failed_attempts', v_link.failed_attempts
    );
  end if;

  if v_reason <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_reason, 'locked_until', v_link.locked_until);
  end if;

  update public.driver_access_links
     set unlocked_at = coalesce(unlocked_at, now()), failed_attempts = 0, locked_until = null, updated_at = now()
   where id = v_link.id
   returning * into v_link;

  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

create or replace function public.driver_trip_status(p_token text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.driver_access_links%rowtype;
  v_freight public.freights%rowtype;
begin
  select * into v_link from public.driver_access_links where token_hash = public.hash_driver_secret(p_token) limit 1;
  if not found or v_link.pin_hash <> public.hash_driver_secret(p_pin) then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;
  select * into v_freight from public.freights where id = v_link.freight_id;
  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

create or replace function public.driver_trip_event(
  p_token text,
  p_pin text,
  p_event_type text,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.driver_access_links%rowtype;
  v_freight public.freights%rowtype;
  v_expected text;
begin
  select * into v_link from public.driver_access_links where token_hash = public.hash_driver_secret(p_token) limit 1;
  if not found or v_link.pin_hash <> public.hash_driver_secret(p_pin) then raise exception 'unauthorized'; end if;
  if v_link.revoked_at is not null or v_link.completed_at is not null or v_link.expires_at < now() then raise exception 'link unavailable'; end if;
  if v_link.locked_until is not null and v_link.locked_until > now() then raise exception 'link locked'; end if;

  select * into v_freight from public.freights where id = v_link.freight_id for update;
  v_expected := public.driver_next_event(v_freight.id);

  if p_event_type <> v_expected or p_event_type in ('proof_uploaded', 'completed') then
    raise exception 'event out of order';
  end if;

  insert into public.freight_events(organization_id, freight_id, order_id, event_type, event_label, latitude, longitude, metadata)
  values (v_freight.organization_id, v_freight.id, v_link.order_id, p_event_type, public.driver_event_label(p_event_type), p_latitude, p_longitude, jsonb_build_object('source', 'driver_link'));

  update public.freights
     set status = case p_event_type
       when 'arrived_loading' then 'loading'
       when 'in_transit' then 'in_route'
       when 'arrived_delivery_location' then 'in_route'
       when 'unloaded' then 'delivered'
       else status
     end,
     updated_at = now()
   where id = v_freight.id
   returning * into v_freight;

  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

create or replace function public.driver_proof_record(
  p_token text,
  p_pin text,
  p_file_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_latitude numeric default null,
  p_longitude numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.driver_access_links%rowtype;
  v_freight public.freights%rowtype;
  v_event_id uuid;
begin
  select * into v_link from public.driver_access_links where token_hash = public.hash_driver_secret(p_token) limit 1;
  if not found or v_link.pin_hash <> public.hash_driver_secret(p_pin) then raise exception 'unauthorized'; end if;
  if v_link.revoked_at is not null or v_link.completed_at is not null or v_link.expires_at < now() then raise exception 'link unavailable'; end if;
  if v_link.locked_until is not null and v_link.locked_until > now() then raise exception 'link locked'; end if;

  select * into v_freight from public.freights where id = v_link.freight_id for update;
  if public.driver_next_event(v_freight.id) <> 'proof_uploaded' then raise exception 'proof out of order'; end if;

  insert into public.freight_events(organization_id, freight_id, order_id, event_type, event_label, latitude, longitude, metadata)
  values (v_freight.organization_id, v_freight.id, v_link.order_id, 'proof_uploaded', public.driver_event_label('proof_uploaded'), p_latitude, p_longitude, jsonb_build_object('source', 'driver_link'))
  returning id into v_event_id;

  insert into public.delivery_proofs(organization_id, freight_id, order_id, event_id, file_path, file_name, mime_type, file_size, metadata)
  values (v_freight.organization_id, v_freight.id, v_link.order_id, v_event_id, p_file_path, p_file_name, p_mime_type, p_file_size, jsonb_build_object('source', 'driver_link'));

  insert into public.freight_events(organization_id, freight_id, order_id, event_type, event_label, metadata)
  values (v_freight.organization_id, v_freight.id, v_link.order_id, 'completed', public.driver_event_label('completed'), jsonb_build_object('source', 'driver_link'));

  update public.freights set status = 'delivered', delivered_at = now(), updated_at = now()
  where id = v_freight.id returning * into v_freight;

  update public.driver_access_links set completed_at = now(), updated_at = now() where id = v_link.id returning * into v_link;

  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

create or replace function public.get_driver_access_summary(p_freight_external_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_freight public.freights%rowtype;
  v_link public.driver_access_links%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select *
    into v_freight
    from public.freights
   where external_id = p_freight_external_id or id::text = p_freight_external_id
   limit 1;

  if not found then
    return null;
  end if;

  select *
    into v_link
    from public.driver_access_links
   where freight_id = v_freight.id
   order by created_at desc
   limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_link.id,
    'freight_id', v_freight.external_id,
    'status',
      case
        when v_link.revoked_at is not null then 'revoked'
        when v_link.completed_at is not null then 'completed'
        when v_link.locked_until is not null and v_link.locked_until > now() then 'locked'
        when v_link.expires_at < now() then 'expired'
        else 'active'
      end,
    'expires_at', v_link.expires_at,
    'revoked_at', v_link.revoked_at,
    'completed_at', v_link.completed_at,
    'locked_until', v_link.locked_until,
    'failed_attempts', v_link.failed_attempts,
    'unlocked_at', v_link.unlocked_at,
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.occurred_at)
      from public.freight_events e
      where e.freight_id = v_freight.id
    ), '[]'::jsonb),
    'proofs', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.uploaded_at)
      from public.delivery_proofs p
      where p.freight_id = v_freight.id
    ), '[]'::jsonb)
  );
end;
$$;

drop policy if exists driver_access_links_select_auth on public.driver_access_links;
create policy driver_access_links_select_auth on public.driver_access_links
  for select to authenticated using (true);

drop policy if exists driver_access_links_write_auth on public.driver_access_links;
create policy driver_access_links_write_auth on public.driver_access_links
  for all to authenticated using (true) with check (true);

drop policy if exists driver_access_attempts_select_auth on public.driver_access_attempts;
create policy driver_access_attempts_select_auth on public.driver_access_attempts
  for select to authenticated using (true);

drop policy if exists freight_events_select_auth on public.freight_events;
create policy freight_events_select_auth on public.freight_events
  for select to authenticated using (true);

drop policy if exists delivery_proofs_select_auth on public.delivery_proofs;
create policy delivery_proofs_select_auth on public.delivery_proofs
  for select to authenticated using (true);

drop policy if exists delivery_proofs_driver_upload_insert on storage.objects;

grant select, insert, update, delete on table
  public.driver_access_links,
  public.driver_access_attempts,
  public.freight_events,
  public.delivery_proofs
to authenticated;

grant select, insert, update, delete on table
  public.driver_access_links,
  public.driver_access_attempts,
  public.freight_events,
  public.delivery_proofs
to service_role;

revoke all on function public.create_driver_access_link(text, text, text, text, timestamptz) from public;
revoke all on function public.revoke_driver_access_link(text) from public;
revoke all on function public.get_driver_access_summary(text) from public;
grant execute on function public.create_driver_access_link(text, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.revoke_driver_access_link(text) to authenticated, service_role;
grant execute on function public.get_driver_access_summary(text) to authenticated, service_role;

grant execute on function public.driver_link_auth(text, text, text) to anon, authenticated, service_role;
grant execute on function public.driver_trip_status(text, text) to anon, authenticated, service_role;
grant execute on function public.driver_trip_event(text, text, text, numeric, numeric) to anon, authenticated, service_role;
grant execute on function public.driver_proof_record(text, text, text, text, text, bigint, numeric, numeric) to anon, authenticated, service_role;
