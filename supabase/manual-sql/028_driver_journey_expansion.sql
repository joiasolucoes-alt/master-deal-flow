-- Nome da alteração: Jornada expandida do motorista (ocorrências, recebedor, notificações, auditoria)
-- Objetivo: Completar o portal do motorista com registro de ocorrências (repetível),
--           dados do recebedor no comprovante, atualização do PEDIDO na entrega, e
--           notificações + auditoria server-side (Frete/Financeiro/Comercial), além de
--           last_access_at no link.
-- Motivo: A migration 202607070003 entrega os 6 marcos + comprovante, mas não cobre
--         ocorrências repetíveis, dados do recebedor, notificações internas nem auditoria.
-- Risco: MÉDIO. Recria RPCs security definer e ajusta constraints de freight_events.
--        Aditivo em colunas. Rode em preview antes de produção.
-- Pode rodar em produção? Sim, após 027 e teste em preview.
-- Dependências: 202607070003_driver_portal.sql aplicada; 027_fix_driver_portal_pgcrypto.sql
--        aplicada ANTES (o portal só funciona com o fix do digest).
-- Como validar: gerar link em Fretes, abrir /motorista/:token, validar PIN, marcar marcos,
--        registrar uma ocorrência, anexar canhoto com nome do recebedor e finalizar.
--        Depois: select * from public.freight_events order by occurred_at;
--                select * from public.notifications where source='driver_link';
--                select * from public.audit_events where entity_type='freight' order by created_at desc;
-- Reversão sugerida: reaplicar as funções da migration 202607070003 (versões originais)
--        e remover as colunas aditivas (opcional).

begin;

-- 1) Colunas aditivas ---------------------------------------------------------
alter table public.driver_access_links add column if not exists last_access_at timestamptz;

alter table public.freight_events
  add column if not exists receiver_name text,
  add column if not exists receiver_document text,
  add column if not exists occurrence_type text,
  add column if not exists estimated_arrival_at timestamptz,
  add column if not exists notes text;

-- Notificações: enriquecer para direcionar por papel e marcar origem.
alter table public.notifications
  add column if not exists target_role text,
  add column if not exists source text;

-- 2) freight_events: permitir 'occurrence' e torná-lo REPETÍVEL ---------------
-- O CHECK inline vira nomeado; a unicidade passa a valer só para os 6 marcos.
alter table public.freight_events drop constraint if exists freight_events_event_type_check;
alter table public.freight_events add constraint freight_events_event_type_check
  check (event_type in (
    'arrived_loading','in_transit','arrived_delivery_location',
    'unloaded','proof_uploaded','completed','occurrence','checkpoint'
  ));

alter table public.freight_events drop constraint if exists freight_events_freight_id_event_type_key;
create unique index if not exists freight_events_milestone_unique
  on public.freight_events(freight_id, event_type)
  where event_type in (
    'arrived_loading','in_transit','arrived_delivery_location',
    'unloaded','proof_uploaded','completed'
  );

-- 3) Helpers de notificação e auditoria (server-side) ------------------------
create or replace function public.mf_driver_notify(
  p_target_role text, p_title text, p_message text, p_type text,
  p_order_external_id text, p_freight_id uuid
) returns void language sql security definer set search_path = public as $$
  insert into public.notifications(title, message, type, target_role, source, entity_type, entity_external_id)
  values (p_title, p_message, coalesce(p_type,'info'), p_target_role, 'driver_link', 'freight',
          coalesce(p_order_external_id, p_freight_id::text));
$$;

create or replace function public.mf_driver_audit(
  p_freight_id uuid, p_order_external_id text, p_action text, p_description text, p_metadata jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.audit_events(entity_type, entity_id, entity_external_id, action, description, metadata)
  values ('freight', p_freight_id, p_order_external_id, p_action, p_description,
          coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('source','driver_link'));
$$;

-- 4) Labels (inclui ocorrência) ----------------------------------------------
create or replace function public.driver_event_label(p_event_type text)
returns text language sql immutable strict as $$
  select case p_event_type
    when 'arrived_loading' then 'Cheguei para carregar'
    when 'in_transit' then 'Estou em trânsito'
    when 'arrived_delivery_location' then 'Cheguei no destino'
    when 'unloaded' then 'Descarreguei a mercadoria'
    when 'proof_uploaded' then 'Comprovante enviado'
    when 'completed' then 'Entrega concluída'
    when 'occurrence' then 'Ocorrência registrada'
    when 'checkpoint' then 'Atualização do motorista'
    else p_event_type
  end
$$;

-- 5) Autenticação: registra last_access_at + auditoria + notifica Frete -------
create or replace function public.driver_link_auth(
  p_token text, p_pin text, p_user_agent text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_link public.driver_access_links%rowtype;
  v_freight public.freights%rowtype;
  v_reason text;
  v_first_access boolean;
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
     where id = v_link.id returning * into v_link;
    return jsonb_build_object('ok', false,
      'reason', case when v_link.locked_until is not null and v_link.locked_until > now() then 'locked' else 'invalid_pin' end,
      'locked_until', v_link.locked_until, 'failed_attempts', v_link.failed_attempts);
  end if;

  if v_reason <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_reason, 'locked_until', v_link.locked_until);
  end if;

  v_first_access := v_link.last_access_at is null;
  update public.driver_access_links
     set unlocked_at = coalesce(unlocked_at, now()), last_access_at = now(),
         failed_attempts = 0, locked_until = null, updated_at = now()
   where id = v_link.id returning * into v_link;

  if v_first_access then
    perform public.mf_driver_audit(v_freight.id, nullif(v_freight.order_external_id,''), 'driver_link_accessed',
      'Motorista acessou o link da entrega.', '{}'::jsonb);
    perform public.mf_driver_notify('Frete', 'Motorista acessou o link',
      'O motorista abriu o acompanhamento da entrega.', 'info',
      nullif(v_freight.order_external_id,''), v_freight.id);
  end if;

  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

-- 6) Marco do motorista: aceita recebedor/observação + auditoria + notifica ---
drop function if exists public.driver_trip_event(text, text, text, numeric, numeric);
create or replace function public.driver_trip_event(
  p_token text, p_pin text, p_event_type text,
  p_latitude numeric default null, p_longitude numeric default null,
  p_receiver_name text default null, p_receiver_document text default null, p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
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

  insert into public.freight_events(
    organization_id, freight_id, order_id, event_type, event_label, latitude, longitude,
    receiver_name, receiver_document, notes, metadata)
  values (v_freight.organization_id, v_freight.id, v_link.order_id, p_event_type,
    public.driver_event_label(p_event_type), p_latitude, p_longitude,
    p_receiver_name, p_receiver_document, p_notes, jsonb_build_object('source','driver_link'));

  update public.freights set status = case p_event_type
       when 'arrived_loading' then 'loading'
       when 'in_transit' then 'in_route'
       when 'arrived_delivery_location' then 'in_route'
       when 'unloaded' then 'delivered'
       else status end,
     updated_at = now()
   where id = v_freight.id returning * into v_freight;

  perform public.mf_driver_audit(v_freight.id, nullif(v_freight.order_external_id,''),
    'driver_' || p_event_type, public.driver_event_label(p_event_type),
    jsonb_build_object('receiver_name', p_receiver_name, 'notes', p_notes));
  perform public.mf_driver_notify('Frete', 'Atualização do motorista',
    public.driver_event_label(p_event_type), 'info', nullif(v_freight.order_external_id,''), v_freight.id);

  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

-- 7) Ocorrência (repetível) — não avança o marco, notifica 3 áreas -----------
create or replace function public.driver_trip_occurrence(
  p_token text, p_pin text, p_occurrence_type text,
  p_notes text default null, p_estimated_arrival timestamptz default null,
  p_latitude numeric default null, p_longitude numeric default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_link public.driver_access_links%rowtype;
  v_freight public.freights%rowtype;
begin
  select * into v_link from public.driver_access_links where token_hash = public.hash_driver_secret(p_token) limit 1;
  if not found or v_link.pin_hash <> public.hash_driver_secret(p_pin) then raise exception 'unauthorized'; end if;
  if v_link.revoked_at is not null or v_link.completed_at is not null or v_link.expires_at < now() then raise exception 'link unavailable'; end if;

  select * into v_freight from public.freights where id = v_link.freight_id;

  insert into public.freight_events(
    organization_id, freight_id, order_id, event_type, event_label, latitude, longitude,
    occurrence_type, notes, estimated_arrival_at, metadata)
  values (v_freight.organization_id, v_freight.id, v_link.order_id, 'occurrence',
    coalesce(p_occurrence_type, 'Ocorrência'), p_latitude, p_longitude,
    p_occurrence_type, p_notes, p_estimated_arrival, jsonb_build_object('source','driver_link'));

  perform public.mf_driver_audit(v_freight.id, nullif(v_freight.order_external_id,''),
    'driver_occurrence', coalesce(p_occurrence_type,'Ocorrência'),
    jsonb_build_object('notes', p_notes, 'estimated_arrival', p_estimated_arrival));
  perform public.mf_driver_notify('Frete', 'Ocorrência na entrega',
    coalesce(p_occurrence_type,'Ocorrência') || coalesce(': ' || p_notes, ''), 'warning',
    nullif(v_freight.order_external_id,''), v_freight.id);
  perform public.mf_driver_notify('Comercial', 'Ocorrência na entrega',
    coalesce(p_occurrence_type,'Ocorrência'), 'warning', nullif(v_freight.order_external_id,''), v_freight.id);
  perform public.mf_driver_notify('Financeiro', 'Ocorrência na entrega',
    coalesce(p_occurrence_type,'Ocorrência'), 'warning', nullif(v_freight.order_external_id,''), v_freight.id);

  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

-- 8) Comprovante: recebedor + atualiza PEDIDO + notifica 3 áreas + auditoria --
drop function if exists public.driver_proof_record(text, text, text, text, text, bigint, numeric, numeric);
create or replace function public.driver_proof_record(
  p_token text, p_pin text, p_file_path text, p_file_name text, p_mime_type text, p_file_size bigint,
  p_latitude numeric default null, p_longitude numeric default null,
  p_receiver_name text default null, p_receiver_document text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_link public.driver_access_links%rowtype;
  v_freight public.freights%rowtype;
  v_event_id uuid;
begin
  select * into v_link from public.driver_access_links where token_hash = public.hash_driver_secret(p_token) limit 1;
  if not found or v_link.pin_hash <> public.hash_driver_secret(p_pin) then raise exception 'unauthorized'; end if;
  if v_link.revoked_at is not null or v_link.completed_at is not null or v_link.expires_at < now() then raise exception 'link unavailable'; end if;

  select * into v_freight from public.freights where id = v_link.freight_id for update;
  if public.driver_next_event(v_freight.id) <> 'proof_uploaded' then raise exception 'proof out of order'; end if;

  insert into public.freight_events(organization_id, freight_id, order_id, event_type, event_label,
    latitude, longitude, receiver_name, receiver_document, metadata)
  values (v_freight.organization_id, v_freight.id, v_link.order_id, 'proof_uploaded',
    public.driver_event_label('proof_uploaded'), p_latitude, p_longitude,
    p_receiver_name, p_receiver_document, jsonb_build_object('source','driver_link'))
  returning id into v_event_id;

  insert into public.delivery_proofs(organization_id, freight_id, order_id, event_id, file_path,
    file_name, mime_type, file_size, metadata)
  values (v_freight.organization_id, v_freight.id, v_link.order_id, v_event_id, p_file_path,
    p_file_name, p_mime_type, p_file_size,
    jsonb_build_object('source','driver_link','receiver_name',p_receiver_name,'uploaded_by_type','driver'));

  insert into public.freight_events(organization_id, freight_id, order_id, event_type, event_label, metadata)
  values (v_freight.organization_id, v_freight.id, v_link.order_id, 'completed',
    public.driver_event_label('completed'), jsonb_build_object('source','driver_link'));

  update public.freights set status = 'delivered', delivered_at = now(), updated_at = now()
   where id = v_freight.id returning * into v_freight;
  update public.driver_access_links set completed_at = now(), updated_at = now()
   where id = v_link.id returning * into v_link;

  -- Atualiza o PEDIDO vinculado (entrega comprovada).
  if v_link.order_id is not null then
    update public.orders
       set status = 'Entregue', delivery_progress = 100, updated_at = now()
     where id = v_link.order_id;
  end if;

  perform public.mf_driver_audit(v_freight.id, nullif(v_freight.order_external_id,''),
    'driver_delivery_completed', 'Entrega finalizada e canhoto anexado pelo motorista.',
    jsonb_build_object('receiver_name', p_receiver_name, 'file_name', p_file_name));
  perform public.mf_driver_notify('Frete', 'Entrega finalizada',
    'Canhoto anexado pelo motorista' || coalesce(' — recebido por ' || p_receiver_name, '') || '.',
    'success', nullif(v_freight.order_external_id,''), v_freight.id);
  perform public.mf_driver_notify('Financeiro', 'Entrega comprovada',
    'Mercadoria entregue e canhoto anexado. Disponível para conciliação.', 'success',
    nullif(v_freight.order_external_id,''), v_freight.id);
  perform public.mf_driver_notify('Comercial', 'Entrega finalizada',
    'A entrega do pedido foi concluída e comprovada.', 'success',
    nullif(v_freight.order_external_id,''), v_freight.id);

  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

-- 9) Payload público: expõe last_access_at (recebedor/ocorrências já vêm em events)
create or replace function public.driver_public_payload(v_link public.driver_access_links, v_freight public.freights)
returns jsonb language sql stable as $$
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
    'link_state', case
        when v_link.revoked_at is not null then 'revoked'
        when v_link.completed_at is not null or v_freight.status = 'completed' then 'completed'
        when v_link.locked_until is not null and v_link.locked_until > now() then 'locked'
        when v_link.expires_at < now() then 'expired'
        else 'active' end,
    'expires_at', v_link.expires_at,
    'last_access_at', v_link.last_access_at,
    'locked_until', v_link.locked_until,
    'failed_attempts', v_link.failed_attempts,
    'requires_proof', coalesce(v_freight.requires_proof, true),
    'next_event', public.driver_next_event(v_freight.id),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at)
      from public.freight_events e where e.freight_id = v_freight.id), '[]'::jsonb),
    'proofs', coalesce((select jsonb_agg(to_jsonb(p) order by p.uploaded_at)
      from public.delivery_proofs p where p.freight_id = v_freight.id), '[]'::jsonb)
  )
$$;

grant execute on function public.driver_trip_occurrence(text,text,text,text,timestamptz,numeric,numeric) to anon, authenticated;

-- 10) Storage: permitir que o motorista (anon) ENVIE o canhoto ---------------
-- Sem edge function publicada, o upload é feito pelo cliente com a chave anon e o
-- registro do metadado é feito pelo RPC driver_proof_record (que valida token+PIN).
-- Segurança: apenas INSERT (envio) para anon no bucket privado 'delivery-proofs';
-- a LEITURA continua restrita (internamente via signed URL). Nota: qualquer anônimo
-- pode ENVIAR arquivos ao bucket — para produção endurecida, publicar a edge function
-- driver-proof-upload (código em supabase/functions/) e restringir esta policy.
drop policy if exists driver_upload_delivery_proof on storage.objects;
create policy driver_upload_delivery_proof on storage.objects
  for insert to anon
  with check (bucket_id = 'delivery-proofs');

commit;
