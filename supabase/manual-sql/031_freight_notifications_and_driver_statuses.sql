-- Nome da alteracao: Notificacoes de frete e status completos da jornada do motorista
-- Objetivo: separar frete previsto/contratado, sincronizar frete e pedido em cada marco
--           do motorista e concluir a entrega somente depois do envio valido do canhoto.
-- Risco: medio. Recria RPCs publicas security definer e constraints de status.
-- Pode rodar em producao? Sim, depois das SQLs 027, 028 e 030.
-- Como validar: executar o fluxo motorista ate a descarga (pedido nao pode ficar Entregue),
--               anexar o canhoto e conferir frete/pedido/notificacoes.
-- Reversao sugerida: reaplicar as funcoes da SQL 028 e a constraint da SQL 022.

begin;

-- 1) Colunas aditivas e compatibilidade -------------------------------------
alter table public.notifications
  add column if not exists target_user_email text,
  add column if not exists target_user_name text;

alter table public.freights
  add column if not exists planned_freight_value numeric;

-- O valor antigo representava o orcamento nas cotacoes. Primeiro o preservamos
-- como previsto; depois zeramos o contratado somente nas cotacoes ainda abertas.
update public.freights
   set planned_freight_value = coalesce(planned_freight_value, freight_value, 0)
 where planned_freight_value is null;

update public.freights
   set freight_value = 0
 where status = 'quoted'
   and coalesce(freight_value, 0) <> 0;

-- 2) Uma unica constraint canonica para freights.status --------------------
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select distinct c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any(c.conkey)
     where c.conrelid = 'public.freights'::regclass
       and c.contype = 'c'
       and a.attname = 'status'
  loop
    execute format('alter table public.freights drop constraint %I', v_constraint.conname);
  end loop;
end $$;

alter table public.freights
  add constraint freights_status_check
  check (status in (
    'quoted',
    'hired',
    'loading',
    'in_route',
    'at_destination',
    'unloaded',
    'delivered',
    'cancelled'
  ));

-- 3) Status operacionais aceitos pelo pedido -------------------------------
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select distinct c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any(c.conkey)
     where c.conrelid = 'public.orders'::regclass
       and c.contype = 'c'
       and a.attname = 'status'
  loop
    execute format('alter table public.orders drop constraint %I', v_constraint.conname);
  end loop;
end $$;

alter table public.orders
  add constraint orders_status_operational_flow_check
  check (status in (
    'Pedido confirmado',
    'Aguardando faturamento',
    'Em faturamento',
    'Aguardando frete',
    'Frete liberado',
    'Aguardando carregamento',
    'Em carregamento',
    'Em separacao',
    'Em separação',
    'Em rota',
    'No destino',
    'Mercadoria descarregada',
    'Entregue',
    'Finalizada',
    'Cancelada'
  ));

-- 4) Ocorrencias podem se repetir; marcos operacionais continuam unicos ----
alter table public.freight_events
  drop constraint if exists freight_events_freight_id_event_type_key;

drop index if exists public.freight_events_freight_id_event_type_key;

alter table public.freight_events
  drop constraint if exists freight_events_event_type_check;

alter table public.freight_events
  add constraint freight_events_event_type_check
  check (event_type in (
    'arrived_loading',
    'in_transit',
    'arrived_delivery_location',
    'unloaded',
    'proof_uploaded',
    'completed',
    'occurrence',
    'checkpoint'
  ));

create unique index if not exists freight_events_milestone_unique
  on public.freight_events(freight_id, event_type)
  where event_type in (
    'arrived_loading',
    'in_transit',
    'arrived_delivery_location',
    'unloaded',
    'proof_uploaded',
    'completed'
  );

-- 5) Helpers de status e notificacao detalhada -----------------------------
create or replace function public.mf_freight_status_label(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'quoted' then 'Em cotacao'
    when 'hired' then 'Aguardando carregamento'
    when 'loading' then 'Em carregamento'
    when 'in_route' then 'Em rota'
    when 'at_destination' then 'No destino'
    when 'unloaded' then 'Mercadoria descarregada'
    when 'delivered' then 'Entregue'
    when 'cancelled' then 'Cancelado'
    else p_status
  end
$$;

create or replace function public.mf_driver_notify_operational(
  p_title text,
  p_order_reference text,
  p_freight_code text,
  p_driver_name text,
  p_action text,
  p_status text,
  p_occurred_at timestamptz,
  p_receiver_name text default null,
  p_notes text default null,
  p_type text default 'info'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_reference text;
  v_message text;
  v_entity_reference text;
begin
  v_reference := coalesce(nullif(p_order_reference, ''), nullif(p_freight_code, ''), 'Operacao');
  v_entity_reference := coalesce(nullif(p_order_reference, ''), nullif(p_freight_code, ''));
  v_message := format(
    '%s | Motorista: %s | Acao: %s | Status atual: %s | Data/hora: %s%s%s',
    v_reference,
    coalesce(nullif(p_driver_name, ''), 'Nao informado'),
    p_action,
    p_status,
    to_char(p_occurred_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
    case when nullif(p_receiver_name, '') is not null
      then ' | Recebedor: ' || p_receiver_name else '' end,
    case when nullif(p_notes, '') is not null
      then ' | Observacoes: ' || p_notes else '' end
  );

  foreach v_role in array array['Frete', 'Comercial', 'Financeiro', 'Admin']
  loop
    insert into public.notifications(
      external_id,
      title,
      message,
      type,
      read,
      entity_type,
      entity_external_id,
      target_role,
      target_user_email,
      target_user_name,
      source,
      created_at
    ) values (
      'driver-' || gen_random_uuid()::text,
      p_title,
      v_message,
      coalesce(p_type, 'info'),
      false,
      'freight',
      v_entity_reference,
      v_role,
      null,
      null,
      'driver_link',
      p_occurred_at
    );
  end loop;
end;
$$;

-- 6) Marco do motorista: sincroniza frete e pedido, sem concluir na descarga
drop function if exists public.driver_trip_event(text, text, text, numeric, numeric);

create or replace function public.driver_trip_event(
  p_token text,
  p_pin text,
  p_event_type text,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_receiver_name text default null,
  p_receiver_document text default null,
  p_notes text default null
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
  v_freight_status text;
  v_order_status text;
  v_progress integer;
  v_occurred_at timestamptz := now();
  v_order_reference text;
begin
  select * into v_link
    from public.driver_access_links
   where token_hash = public.hash_driver_secret(p_token)
   limit 1;

  if not found or v_link.pin_hash <> public.hash_driver_secret(p_pin) then
    raise exception 'unauthorized';
  end if;
  if v_link.revoked_at is not null or v_link.completed_at is not null or v_link.expires_at < now() then
    raise exception 'link unavailable';
  end if;
  if v_link.locked_until is not null and v_link.locked_until > now() then
    raise exception 'link locked';
  end if;

  select * into v_freight
    from public.freights
   where id = v_link.freight_id
   for update;

  v_expected := public.driver_next_event(v_freight.id);
  if p_event_type <> v_expected or p_event_type in ('proof_uploaded', 'completed') then
    raise exception 'event out of order';
  end if;

  select freight_status, order_status, progress
    into v_freight_status, v_order_status, v_progress
    from (values
      ('arrived_loading', 'loading', 'Em carregamento', 35),
      ('in_transit', 'in_route', 'Em rota', 70),
      ('arrived_delivery_location', 'at_destination', 'No destino', 85),
      ('unloaded', 'unloaded', 'Mercadoria descarregada', 95)
    ) as mapping(event_type, freight_status, order_status, progress)
   where event_type = p_event_type;

  if v_freight_status is null then
    raise exception 'unsupported driver event';
  end if;

  insert into public.freight_events(
    organization_id,
    freight_id,
    order_id,
    event_type,
    event_label,
    occurred_at,
    latitude,
    longitude,
    receiver_name,
    receiver_document,
    notes,
    metadata
  ) values (
    v_freight.organization_id,
    v_freight.id,
    v_link.order_id,
    p_event_type,
    public.driver_event_label(p_event_type),
    v_occurred_at,
    p_latitude,
    p_longitude,
    p_receiver_name,
    p_receiver_document,
    p_notes,
    jsonb_build_object('source', 'driver_link', 'resulting_status', v_freight_status)
  );

  update public.freights
     set status = v_freight_status,
         updated_at = v_occurred_at
   where id = v_freight.id
   returning * into v_freight;

  update public.orders
     set status = v_order_status,
         delivery_progress = v_progress,
         updated_at = v_occurred_at
   where (v_link.order_id is not null and id = v_link.order_id)
      or (nullif(v_freight.order_external_id, '') is not null
          and external_id = v_freight.order_external_id)
   returning number into v_order_reference;

  v_order_reference := coalesce(
    nullif(v_order_reference, ''),
    nullif(v_freight.order_external_id, ''),
    nullif(v_freight.order_number, '')
  );

  perform public.mf_driver_audit(
    v_freight.id,
    nullif(v_freight.order_external_id, ''),
    'driver_' || p_event_type,
    public.driver_event_label(p_event_type),
    jsonb_build_object(
      'driver_name', v_freight.driver_name,
      'status', v_freight_status,
      'receiver_name', p_receiver_name,
      'receiver_document', p_receiver_document,
      'notes', p_notes
    )
  );

  perform public.mf_driver_notify_operational(
    public.driver_event_label(p_event_type),
    v_order_reference,
    v_freight.external_id,
    v_freight.driver_name,
    public.driver_event_label(p_event_type),
    public.mf_freight_status_label(v_freight_status),
    v_occurred_at,
    p_receiver_name,
    p_notes,
    'info'
  );

  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

-- 7) Ocorrencia repetivel com previsao, contexto e quatro destinatarios ------
create or replace function public.driver_trip_occurrence(
  p_token text,
  p_pin text,
  p_occurrence_type text,
  p_notes text default null,
  p_estimated_arrival timestamptz default null,
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
  v_occurred_at timestamptz := now();
  v_order_reference text;
  v_notes text;
begin
  select * into v_link
    from public.driver_access_links
   where token_hash = public.hash_driver_secret(p_token)
   limit 1;

  if not found or v_link.pin_hash <> public.hash_driver_secret(p_pin) then
    raise exception 'unauthorized';
  end if;
  if v_link.revoked_at is not null or v_link.completed_at is not null or v_link.expires_at < now() then
    raise exception 'link unavailable';
  end if;
  if v_link.locked_until is not null and v_link.locked_until > now() then
    raise exception 'link locked';
  end if;

  select * into v_freight
    from public.freights
   where id = v_link.freight_id;

  select number into v_order_reference
    from public.orders
   where (v_link.order_id is not null and id = v_link.order_id)
      or (nullif(v_freight.order_external_id, '') is not null
          and external_id = v_freight.order_external_id)
   limit 1;

  v_order_reference := coalesce(
    nullif(v_order_reference, ''),
    nullif(v_freight.order_external_id, ''),
    nullif(v_freight.order_number, '')
  );
  v_notes := concat_ws(
    ' | ',
    nullif(p_notes, ''),
    case when p_estimated_arrival is not null
      then 'Nova previsao: ' || to_char(
        p_estimated_arrival at time zone 'America/Sao_Paulo',
        'DD/MM/YYYY HH24:MI'
      )
      else null
    end
  );

  insert into public.freight_events(
    organization_id,
    freight_id,
    order_id,
    event_type,
    event_label,
    occurred_at,
    latitude,
    longitude,
    occurrence_type,
    notes,
    estimated_arrival_at,
    metadata
  ) values (
    v_freight.organization_id,
    v_freight.id,
    v_link.order_id,
    'occurrence',
    coalesce(nullif(p_occurrence_type, ''), 'Ocorrencia'),
    v_occurred_at,
    p_latitude,
    p_longitude,
    coalesce(nullif(p_occurrence_type, ''), 'Ocorrencia'),
    p_notes,
    p_estimated_arrival,
    jsonb_build_object(
      'source', 'driver_link',
      'driver_name', v_freight.driver_name,
      'order_reference', v_order_reference
    )
  );

  perform public.mf_driver_audit(
    v_freight.id,
    nullif(v_freight.order_external_id, ''),
    'driver_occurrence',
    coalesce(nullif(p_occurrence_type, ''), 'Ocorrencia'),
    jsonb_build_object(
      'driver_name', v_freight.driver_name,
      'notes', p_notes,
      'estimated_arrival', p_estimated_arrival
    )
  );

  perform public.mf_driver_notify_operational(
    'Ocorrencia na entrega',
    v_order_reference,
    v_freight.external_id,
    v_freight.driver_name,
    coalesce(nullif(p_occurrence_type, ''), 'Ocorrencia registrada'),
    public.mf_freight_status_label(v_freight.status),
    v_occurred_at,
    null,
    nullif(v_notes, ''),
    'warning'
  );

  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

-- 8) Somente um canhoto valido conclui frete, pedido e acesso do motorista ---
create or replace function public.driver_proof_record(
  p_token text,
  p_pin text,
  p_file_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_receiver_name text default null,
  p_receiver_document text default null
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
  v_occurred_at timestamptz := now();
  v_order_reference text;
  v_proof_notes text;
begin
  if nullif(trim(p_file_path), '') is null
     or nullif(trim(p_file_name), '') is null
     or coalesce(p_file_size, 0) <= 0
     or lower(coalesce(p_mime_type, '')) not in (
       'image/jpeg', 'image/jpg', 'image/png', 'application/pdf'
     ) then
    raise exception 'invalid proof';
  end if;

  select * into v_link
    from public.driver_access_links
   where token_hash = public.hash_driver_secret(p_token)
   limit 1;

  if not found or v_link.pin_hash <> public.hash_driver_secret(p_pin) then
    raise exception 'unauthorized';
  end if;
  if v_link.revoked_at is not null or v_link.completed_at is not null or v_link.expires_at < now() then
    raise exception 'link unavailable';
  end if;
  if v_link.locked_until is not null and v_link.locked_until > now() then
    raise exception 'link locked';
  end if;

  select * into v_freight
    from public.freights
   where id = v_link.freight_id
   for update;

  if public.driver_next_event(v_freight.id) <> 'proof_uploaded' then
    raise exception 'proof out of order';
  end if;

  insert into public.freight_events(
    organization_id,
    freight_id,
    order_id,
    event_type,
    event_label,
    occurred_at,
    latitude,
    longitude,
    receiver_name,
    receiver_document,
    metadata
  ) values (
    v_freight.organization_id,
    v_freight.id,
    v_link.order_id,
    'proof_uploaded',
    public.driver_event_label('proof_uploaded'),
    v_occurred_at,
    p_latitude,
    p_longitude,
    p_receiver_name,
    p_receiver_document,
    jsonb_build_object('source', 'driver_link', 'file_name', p_file_name)
  ) returning id into v_event_id;

  insert into public.delivery_proofs(
    organization_id,
    freight_id,
    order_id,
    event_id,
    file_path,
    file_name,
    mime_type,
    file_size,
    metadata
  ) values (
    v_freight.organization_id,
    v_freight.id,
    v_link.order_id,
    v_event_id,
    p_file_path,
    p_file_name,
    p_mime_type,
    p_file_size,
    jsonb_build_object(
      'source', 'driver_link',
      'receiver_name', p_receiver_name,
      'receiver_document', p_receiver_document,
      'uploaded_by_type', 'driver'
    )
  );

  insert into public.freight_events(
    organization_id,
    freight_id,
    order_id,
    event_type,
    event_label,
    occurred_at,
    metadata
  ) values (
    v_freight.organization_id,
    v_freight.id,
    v_link.order_id,
    'completed',
    public.driver_event_label('completed'),
    v_occurred_at,
    jsonb_build_object('source', 'driver_link', 'proof_event_id', v_event_id)
  );

  update public.freights
     set status = 'delivered',
         delivered_at = v_occurred_at,
         updated_at = v_occurred_at
   where id = v_freight.id
   returning * into v_freight;

  update public.driver_access_links
     set completed_at = v_occurred_at,
         updated_at = v_occurred_at
   where id = v_link.id
   returning * into v_link;

  update public.orders
     set status = 'Entregue',
         delivery_progress = 100,
         updated_at = v_occurred_at
   where (v_link.order_id is not null and id = v_link.order_id)
      or (nullif(v_freight.order_external_id, '') is not null
          and external_id = v_freight.order_external_id)
   returning number into v_order_reference;

  v_order_reference := coalesce(
    nullif(v_order_reference, ''),
    nullif(v_freight.order_external_id, ''),
    nullif(v_freight.order_number, '')
  );
  v_proof_notes := concat_ws(
    ' | ',
    case when nullif(p_receiver_document, '') is not null
      then 'Documento: ' || p_receiver_document else null end,
    'Arquivo: ' || p_file_name
  );

  perform public.mf_driver_audit(
    v_freight.id,
    nullif(v_freight.order_external_id, ''),
    'driver_delivery_completed',
    'Entrega finalizada e canhoto anexado pelo motorista.',
    jsonb_build_object(
      'driver_name', v_freight.driver_name,
      'receiver_name', p_receiver_name,
      'receiver_document', p_receiver_document,
      'file_name', p_file_name
    )
  );

  perform public.mf_driver_notify_operational(
    'Entrega finalizada com canhoto',
    v_order_reference,
    v_freight.external_id,
    v_freight.driver_name,
    'Comprovante enviado',
    'Entregue',
    v_occurred_at,
    p_receiver_name,
    v_proof_notes,
    'success'
  );

  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

grant execute on function public.driver_trip_event(
  text, text, text, numeric, numeric, text, text, text
) to anon, authenticated;

grant execute on function public.driver_trip_occurrence(
  text, text, text, text, timestamptz, numeric, numeric
) to anon, authenticated;

grant execute on function public.driver_proof_record(
  text, text, text, text, text, bigint, numeric, numeric, text, text
) to anon, authenticated;

commit;
