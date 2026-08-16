-- Nome da alteracao: Fluxo de recusa de entrega
-- Objetivo: registrar a recusa do cliente, pausar a jornada do motorista e permitir
--           nova tentativa, retorno da carga ou cancelamento sem marcar o pedido como entregue.
-- Risco: medio. Amplia constraints de status e cria duas RPCs security definer.
-- Dependencias: SQLs 031, 032, 033 e 034.
-- Pode rodar em producao? Sim, depois de revisar e testar em uma operacao controlada.

begin;

-- 1) Estados operacionais --------------------------------------------------
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
    'delivery_refused',
    'returning',
    'returned',
    'unloaded',
    'delivered',
    'cancelled'
  ));

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
    'Entrega recusada',
    'Retorno em andamento',
    'Mercadoria devolvida',
    'Mercadoria descarregada',
    'Entregue',
    'Finalizada',
    'Cancelada'
  ));

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
    when 'delivery_refused' then 'Entrega recusada'
    when 'returning' then 'Retorno em andamento'
    when 'returned' then 'Mercadoria devolvida'
    when 'unloaded' then 'Mercadoria descarregada'
    when 'delivered' then 'Entregue'
    when 'cancelled' then 'Cancelado'
    else p_status
  end
$$;

-- 2) Registro formal da recusa --------------------------------------------
create table if not exists public.delivery_refusals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null,
  freight_id uuid not null references public.freights(id) on delete cascade,
  order_id uuid null references public.orders(id) on delete set null,
  driver_access_link_id uuid null references public.driver_access_links(id) on delete set null,
  refusal_scope text not null check (refusal_scope in ('total', 'partial')),
  reason text not null,
  refused_items text,
  evidence_path text not null,
  evidence_file_name text not null,
  evidence_mime_type text not null,
  evidence_file_size bigint not null,
  status text not null default 'open'
    check (status in ('open', 'reattempt_scheduled', 'returning', 'returned', 'cancelled')),
  decision_notes text,
  additional_cost numeric(14,2) not null default 0,
  cost_owner text,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_refusals_freight_idx
  on public.delivery_refusals(freight_id, occurred_at desc);
create index if not exists delivery_refusals_order_idx
  on public.delivery_refusals(order_id, occurred_at desc);
create index if not exists delivery_refusals_status_idx
  on public.delivery_refusals(status);

alter table public.delivery_refusals enable row level security;

drop policy if exists delivery_refusals_select_auth on public.delivery_refusals;
create policy delivery_refusals_select_auth
  on public.delivery_refusals for select
  to authenticated
  using (
    organization_id is null
    or exists (
      select 1
        from public.organization_members om
       where om.organization_id = delivery_refusals.organization_id
         and om.user_id = auth.uid()
    )
  );

drop policy if exists delivery_refusals_manage_auth on public.delivery_refusals;
create policy delivery_refusals_manage_auth
  on public.delivery_refusals for all
  to authenticated
  using (
    organization_id is null
    or exists (
      select 1
        from public.organization_members om
       where om.organization_id = delivery_refusals.organization_id
         and om.user_id = auth.uid()
         and lower(om.role) in ('admin', 'gestor', 'frete', 'frota')
    )
  )
  with check (
    organization_id is null
    or exists (
      select 1
        from public.organization_members om
       where om.organization_id = delivery_refusals.organization_id
         and om.user_id = auth.uid()
         and lower(om.role) in ('admin', 'gestor', 'frete', 'frota')
    )
  );

grant select, insert, update on public.delivery_refusals to authenticated;
grant all on public.delivery_refusals to service_role;

-- 3) Enquanto houver recusa/retorno, o motorista nao pode pular etapas -----
create or replace function public.driver_next_event(p_freight_id uuid)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.freights where id = p_freight_id;
  if v_status in ('delivery_refused', 'returning', 'returned', 'cancelled') then
    return null;
  end if;

  if not exists (
    select 1 from public.freight_events
     where freight_id = p_freight_id and event_type = 'arrived_loading'
  ) then
    return 'arrived_loading';
  elsif not exists (
    select 1 from public.freight_events
     where freight_id = p_freight_id and event_type = 'in_transit'
  ) then
    return 'in_transit';
  elsif not exists (
    select 1 from public.freight_events
     where freight_id = p_freight_id and event_type = 'arrived_delivery_location'
  ) then
    return 'arrived_delivery_location';
  elsif not exists (
    select 1 from public.freight_events
     where freight_id = p_freight_id and event_type = 'unloaded'
  ) then
    return 'unloaded';
  elsif not exists (
    select 1 from public.freight_events
     where freight_id = p_freight_id and event_type = 'proof_uploaded'
  ) then
    return 'proof_uploaded';
  elsif not exists (
    select 1 from public.freight_events
     where freight_id = p_freight_id and event_type = 'completed'
  ) then
    return 'completed';
  end if;
  return null;
end;
$$;

-- 4) RPC publica: motorista registra a recusa com evidencia ----------------
drop function if exists public.driver_trip_refusal(
  text, text, text, text, text, text, text, text, bigint, numeric, numeric
);

create or replace function public.driver_trip_refusal(
  p_token text,
  p_pin text,
  p_refusal_scope text,
  p_reason text,
  p_refused_items text,
  p_evidence_path text,
  p_evidence_file_name text,
  p_evidence_mime_type text,
  p_evidence_file_size bigint,
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
  v_order_id uuid;
  v_order_reference text;
  v_refusal_id uuid;
  v_occurred_at timestamptz := now();
begin
  if p_refusal_scope not in ('total', 'partial') then
    raise exception 'invalid refusal scope';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'refusal reason required';
  end if;
  if p_refusal_scope = 'partial' and nullif(trim(p_refused_items), '') is null then
    raise exception 'refused items required';
  end if;
  if nullif(trim(p_evidence_path), '') is null
     or nullif(trim(p_evidence_file_name), '') is null
     or coalesce(p_evidence_file_size, 0) <= 0
     or lower(coalesce(p_evidence_mime_type, '')) not in (
       'image/jpeg', 'image/jpg', 'image/png', 'application/pdf'
     ) then
    raise exception 'invalid refusal evidence';
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

  if v_freight.status not in ('in_route', 'at_destination') then
    raise exception 'refusal is only allowed during delivery or at destination';
  end if;

  v_order_id := v_link.order_id;
  if v_order_id is null and nullif(v_freight.order_external_id, '') is not null then
    select id into v_order_id
      from public.orders
     where external_id = v_freight.order_external_id
     limit 1;
  end if;

  select number into v_order_reference
    from public.orders
   where id = v_order_id;
  v_order_reference := coalesce(
    nullif(v_order_reference, ''),
    nullif(v_freight.order_number, ''),
    nullif(v_freight.order_external_id, '')
  );

  insert into public.delivery_refusals(
    organization_id,
    freight_id,
    order_id,
    driver_access_link_id,
    refusal_scope,
    reason,
    refused_items,
    evidence_path,
    evidence_file_name,
    evidence_mime_type,
    evidence_file_size,
    occurred_at
  ) values (
    v_freight.organization_id,
    v_freight.id,
    v_order_id,
    v_link.id,
    p_refusal_scope,
    trim(p_reason),
    nullif(trim(p_refused_items), ''),
    p_evidence_path,
    p_evidence_file_name,
    p_evidence_mime_type,
    p_evidence_file_size,
    v_occurred_at
  ) returning id into v_refusal_id;

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
    metadata
  ) values (
    v_freight.organization_id,
    v_freight.id,
    v_order_id,
    'occurrence',
    'Cliente recusou a entrega',
    v_occurred_at,
    p_latitude,
    p_longitude,
    'Cliente recusou a entrega',
    trim(p_reason),
    jsonb_build_object(
      'source', 'driver_link',
      'refusal_id', v_refusal_id,
      'refusal_scope', p_refusal_scope,
      'refused_items', nullif(trim(p_refused_items), ''),
      'evidence_path', p_evidence_path,
      'evidence_file_name', p_evidence_file_name,
      'evidence_mime_type', p_evidence_mime_type,
      'evidence_file_size', p_evidence_file_size,
      'resulting_status', 'delivery_refused'
    )
  );

  update public.freights
     set status = 'delivery_refused',
         delivered_at = null,
         updated_at = v_occurred_at
   where id = v_freight.id
   returning * into v_freight;

  update public.orders
     set status = 'Entrega recusada',
         delivery_progress = greatest(coalesce(delivery_progress, 0), 85),
         logistics_status = 'Cliente recusou a entrega. Aguardando decisao do time de Frete.',
         updated_at = v_occurred_at
   where id = v_order_id;

  perform public.mf_driver_audit(
    v_freight.id,
    nullif(v_freight.order_external_id, ''),
    'driver_delivery_refused',
    'Cliente recusou a entrega.',
    jsonb_build_object(
      'refusal_id', v_refusal_id,
      'driver_name', v_freight.driver_name,
      'scope', p_refusal_scope,
      'reason', p_reason,
      'refused_items', p_refused_items,
      'evidence_file_name', p_evidence_file_name
    )
  );

  perform public.mf_driver_notify_operational(
    'Cliente recusou a entrega',
    v_order_reference,
    v_freight.external_id,
    v_freight.driver_name,
    case when p_refusal_scope = 'partial' then 'Recusa parcial' else 'Recusa total' end,
    'Entrega recusada',
    v_occurred_at,
    null,
    concat_ws(' | ', trim(p_reason), nullif(trim(p_refused_items), '')),
    'warning'
  );

  return jsonb_build_object('ok', true, 'trip', public.driver_public_payload(v_link, v_freight));
end;
$$;

-- 5) RPC autenticada: Frete decide o tratamento ---------------------------
drop function if exists public.resolve_delivery_refusal(text, text, text, numeric, text);

create or replace function public.resolve_delivery_refusal(
  p_freight_external_id text,
  p_decision text,
  p_notes text default null,
  p_additional_cost numeric default 0,
  p_cost_owner text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_freight public.freights%rowtype;
  v_order public.orders%rowtype;
  v_refusal public.delivery_refusals%rowtype;
  v_role text;
  v_freight_status text;
  v_order_status text;
  v_refusal_status text;
  v_action text;
  v_progress integer;
  v_now timestamptz := now();
  v_title_external_id text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if p_decision not in ('reattempt', 'return', 'returned', 'cancel') then
    raise exception 'invalid refusal decision';
  end if;

  select * into v_freight
    from public.freights
   where external_id = p_freight_external_id or id::text = p_freight_external_id
   limit 1
   for update;
  if not found then raise exception 'freight not found'; end if;

  if v_freight.organization_id is not null then
    select lower(om.role) into v_role
      from public.organization_members om
     where om.organization_id = v_freight.organization_id
       and om.user_id = auth.uid()
     limit 1;
    if coalesce(v_role, '') not in ('admin', 'gestor', 'frete', 'frota') then
      raise exception 'permission denied';
    end if;
  end if;

  select * into v_order
    from public.orders
   where id = v_freight.order_id
      or (nullif(v_freight.order_external_id, '') is not null
          and external_id = v_freight.order_external_id)
   limit 1;

  select * into v_refusal
    from public.delivery_refusals
   where freight_id = v_freight.id
     and status in ('open', 'returning')
   order by occurred_at desc
   limit 1
   for update;
  if not found then raise exception 'open refusal not found'; end if;

  if p_decision = 'reattempt' then
    if v_refusal.status <> 'open' then raise exception 'reattempt not allowed'; end if;
    v_freight_status := 'at_destination';
    v_order_status := 'No destino';
    v_refusal_status := 'reattempt_scheduled';
    v_action := 'Nova tentativa de entrega liberada';
    v_progress := 85;
  elsif p_decision = 'return' then
    if v_refusal.status <> 'open' then raise exception 'return already started'; end if;
    v_freight_status := 'returning';
    v_order_status := 'Retorno em andamento';
    v_refusal_status := 'returning';
    v_action := 'Retorno da mercadoria iniciado';
    v_progress := 90;
  elsif p_decision = 'returned' then
    if v_refusal.status <> 'returning' then raise exception 'return not started'; end if;
    v_freight_status := 'returned';
    v_order_status := 'Mercadoria devolvida';
    v_refusal_status := 'returned';
    v_action := 'Mercadoria devolvida a origem';
    v_progress := 100;
  else
    v_freight_status := 'cancelled';
    v_order_status := 'Cancelada';
    v_refusal_status := 'cancelled';
    v_action := 'Operacao cancelada apos recusa';
    v_progress := greatest(coalesce(v_order.delivery_progress, 0), 85);
  end if;

  update public.delivery_refusals
     set status = v_refusal_status,
         decision_notes = nullif(trim(p_notes), ''),
         additional_cost = greatest(coalesce(p_additional_cost, 0), 0),
         cost_owner = case when coalesce(p_additional_cost, 0) > 0 then p_cost_owner else null end,
         resolved_at = case when v_refusal_status = 'returning' then null else v_now end,
         resolved_by = auth.uid(),
         updated_at = v_now
   where id = v_refusal.id;

  update public.freights
     set status = v_freight_status,
         delivered_at = null,
         updated_at = v_now
   where id = v_freight.id
   returning * into v_freight;

  if v_order.id is not null then
    update public.orders
       set status = v_order_status,
           delivery_progress = v_progress,
           logistics_status = v_action || coalesce('. ' || nullif(trim(p_notes), ''), ''),
           updated_at = v_now
     where id = v_order.id
     returning * into v_order;
  end if;

  if p_decision in ('returned', 'cancel') then
    update public.driver_access_links
       set revoked_at = coalesce(revoked_at, v_now),
           updated_at = v_now
     where freight_id = v_freight.id
       and completed_at is null;
  end if;

  insert into public.freight_events(
    organization_id,
    freight_id,
    order_id,
    event_type,
    event_label,
    occurred_at,
    notes,
    metadata
  ) values (
    v_freight.organization_id,
    v_freight.id,
    v_order.id,
    'checkpoint',
    v_action,
    v_now,
    nullif(trim(p_notes), ''),
    jsonb_build_object(
      'source', 'master_flow',
      'refusal_id', v_refusal.id,
      'decision', p_decision,
      'additional_cost', greatest(coalesce(p_additional_cost, 0), 0),
      'cost_owner', p_cost_owner,
      'resulting_status', v_freight_status
    )
  );

  if coalesce(p_additional_cost, 0) > 0 and v_order.id is not null then
    v_title_external_id := 'fin-refusal-' || v_refusal.id::text;
    update public.financial_titles
       set amount = greatest(p_additional_cost, 0),
           cost_owner = p_cost_owner,
           cost_reason = nullif(trim(p_notes), ''),
           notes = 'Custo adicional da recusa de entrega do pedido ' || coalesce(v_order.number, v_freight.code),
           updated_at = v_now
     where external_id = v_title_external_id;

    if not found then
      insert into public.financial_titles(
      external_id,
      organization_id,
      order_id,
      order_external_id,
      order_number,
      client_name,
      title_number,
      type,
      kind,
      status,
      due_date,
      amount,
      paid_amount,
      cost_owner,
      cost_reason,
      payment_method,
      bank_name,
      notes,
      owner_name,
      unit_name,
      created_at,
      updated_at
      ) values (
      v_title_external_id,
      v_freight.organization_id,
      v_order.id,
      v_order.external_id,
      v_order.number,
      v_order.client_name,
      'RECUSA-' || coalesce(nullif(regexp_replace(v_order.number, '\D', '', 'g'), ''), right(v_refusal.id::text, 6)),
      'payable',
      case when p_decision = 'reattempt' then 'expense' else 'return' end,
      'open',
      current_date,
      greatest(p_additional_cost, 0),
      0,
      p_cost_owner,
      nullif(trim(p_notes), ''),
      'A definir',
      '',
      'Custo adicional da recusa de entrega do pedido ' || coalesce(v_order.number, v_freight.code),
      v_order.responsible_name,
      v_order.unit_name,
      v_now,
      v_now
      );
    end if;
  end if;

  perform public.mf_driver_audit(
    v_freight.id,
    nullif(v_freight.order_external_id, ''),
    'delivery_refusal_' || p_decision,
    v_action,
    jsonb_build_object(
      'refusal_id', v_refusal.id,
      'notes', p_notes,
      'additional_cost', p_additional_cost,
      'cost_owner', p_cost_owner,
      'status', v_freight_status
    )
  );

  perform public.mf_driver_notify_operational(
    v_action,
    coalesce(v_order.number, v_freight.order_number),
    v_freight.external_id,
    v_freight.driver_name,
    v_action,
    public.mf_freight_status_label(v_freight_status),
    v_now,
    null,
    nullif(trim(p_notes), ''),
    case when p_decision = 'reattempt' then 'info' else 'warning' end
  );

  return jsonb_build_object(
    'ok', true,
    'freight_status', v_freight_status,
    'order_status', v_order_status,
    'financial_title_external_id', v_title_external_id
  );
end;
$$;

-- 6) Resumo administrativo inclui o status atual do frete -----------------
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
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into v_freight
    from public.freights
   where external_id = p_freight_external_id or id::text = p_freight_external_id
   limit 1;
  if not found then return null; end if;

  select * into v_link
    from public.driver_access_links
   where freight_id = v_freight.id
   order by created_at desc
   limit 1;
  if not found then return null; end if;

  return jsonb_build_object(
    'id', v_link.id,
    'freight_id', v_freight.external_id,
    'freight_status', v_freight.status,
    'status', case
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

revoke all on function public.driver_trip_refusal(
  text, text, text, text, text, text, text, text, bigint, numeric, numeric
) from public;
grant execute on function public.driver_trip_refusal(
  text, text, text, text, text, text, text, text, bigint, numeric, numeric
) to anon, authenticated, service_role;

revoke all on function public.resolve_delivery_refusal(text, text, text, numeric, text) from public;
grant execute on function public.resolve_delivery_refusal(text, text, text, numeric, text)
  to authenticated, service_role;

commit;

-- Validacao sugerida depois de executar:
-- select status, count(*) from public.delivery_refusals group by status;
-- select code, status from public.freights where status in ('delivery_refused','returning','returned');
-- select number, status, logistics_status from public.orders
--  where status in ('Entrega recusada','Retorno em andamento','Mercadoria devolvida');
