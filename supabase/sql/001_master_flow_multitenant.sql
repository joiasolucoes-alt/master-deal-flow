-- =====================================================================
-- Master Flow — Onda 1 multiempresa/multiunidade
-- Migration aditiva (sem DROP TABLE). Aplique manualmente no Supabase
-- (SQL Editor) OU via ferramenta de migration quando estiver disponível,
-- pois esta sessão do agente não expôs a ferramenta de migration.
-- =====================================================================

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. Organizações
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  cnpj text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;
drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

insert into public.organizations (id, name, legal_name)
values ('00000000-0000-0000-0000-00000000m4st'::uuid,
        'Master Distribuidora e Logística','Master Distribuidora e Logística LTDA')
on conflict (id) do nothing;

-- Units (já existe). Adiciona multi-tenant.
alter table public.units
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists cnpj text,
  add column if not exists address text;

insert into public.units (id, external_id, name, city, state, organization_id) values
  ('00000000-0000-0000-0000-000000000u01'::uuid,'unit-matriz-cataguases','Matriz Cataguases','Cataguases','MG','00000000-0000-0000-0000-00000000m4st'::uuid),
  ('00000000-0000-0000-0000-000000000u02'::uuid,'unit-filial-es','Filial Espírito Santo','Vitória','ES','00000000-0000-0000-0000-00000000m4st'::uuid),
  ('00000000-0000-0000-0000-000000000u03'::uuid,'unit-filial-rj','Filial Rio de Janeiro','Rio de Janeiro','RJ','00000000-0000-0000-0000-00000000m4st'::uuid)
on conflict (id) do update set organization_id = excluded.organization_id;

update public.units set organization_id = '00000000-0000-0000-0000-00000000m4st'::uuid where organization_id is null;
create index if not exists idx_units_organization on public.units(organization_id);

-- 2. Profiles + organization_members
alter table public.profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists default_unit_id uuid references public.units(id);

update public.profiles set full_name = name where full_name is null;
create unique index if not exists ux_profiles_auth_user on public.profiles(auth_user_id) where auth_user_id is not null;

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','gestor','comercial','aprovador','financeiro','frota','motorista','viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_org_members_user_unit
  on public.organization_members (organization_id, user_id, (coalesce(unit_id,'00000000-0000-0000-0000-000000000000'::uuid)));
create index if not exists idx_org_members_user on public.organization_members(user_id);
create index if not exists idx_org_members_org  on public.organization_members(organization_id);
create index if not exists idx_org_members_unit on public.organization_members(unit_id);
create index if not exists idx_org_members_role on public.organization_members(role);
grant select, insert, update, delete on public.organization_members to authenticated;
grant all on public.organization_members to service_role;
drop trigger if exists trg_org_members_updated_at on public.organization_members;
create trigger trg_org_members_updated_at before update on public.organization_members
  for each row execute function public.set_updated_at();
alter table public.organization_members enable row level security;
alter table public.organizations enable row level security;

-- 3. Funções RLS
create or replace function public.is_member_of_organization(_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
    where organization_id = _org_id and user_id = auth.uid())
$$;

create or replace function public.has_role(_org_id uuid, _roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members
    where organization_id = _org_id and user_id = auth.uid() and role = any(_roles))
$$;

create or replace function public.can_access_unit(_unit_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.units u
      join public.organization_members m on m.organization_id = u.organization_id
     where u.id = _unit_id and m.user_id = auth.uid()
       and (m.unit_id is null or m.unit_id = _unit_id or m.role in ('admin','gestor')))
$$;

create or replace function public.current_user_organizations()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct organization_id from public.organization_members where user_id = auth.uid()
$$;

drop policy if exists "organizations_select" on public.organizations;
create policy "organizations_select" on public.organizations for select to authenticated
  using (id in (select public.current_user_organizations()));
drop policy if exists "organizations_update" on public.organizations;
create policy "organizations_update" on public.organizations for update to authenticated
  using (public.has_role(id, array['admin'])) with check (public.has_role(id, array['admin']));

drop policy if exists "authenticated_select_units" on public.units;
drop policy if exists "authenticated_insert_units" on public.units;
drop policy if exists "authenticated_update_units" on public.units;
create policy "units_select" on public.units for select to authenticated
  using (organization_id is null or public.is_member_of_organization(organization_id));
create policy "units_insert" on public.units for insert to authenticated
  with check (public.has_role(organization_id, array['admin','gestor']));
create policy "units_update" on public.units for update to authenticated
  using (public.has_role(organization_id, array['admin','gestor']))
  with check (public.has_role(organization_id, array['admin','gestor']));
create policy "units_delete" on public.units for delete to authenticated
  using (public.has_role(organization_id, array['admin']));

drop policy if exists "authenticated_select_profiles" on public.profiles;
drop policy if exists "authenticated_insert_profiles" on public.profiles;
drop policy if exists "authenticated_update_profiles" on public.profiles;
create policy "profiles_select_self" on public.profiles for select to authenticated using (auth_user_id = auth.uid());
create policy "profiles_select_org_admin" on public.profiles for select to authenticated
  using (exists (select 1 from public.organization_members m where m.user_id = auth.uid() and m.role in ('admin','gestor')));
create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (auth_user_id = auth.uid());
create policy "profiles_update_self" on public.profiles for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy "org_members_select" on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.has_role(organization_id, array['admin','gestor']));
create policy "org_members_insert" on public.organization_members for insert to authenticated
  with check (public.has_role(organization_id, array['admin']));
create policy "org_members_update" on public.organization_members for update to authenticated using (public.has_role(organization_id, array['admin']));
create policy "org_members_delete" on public.organization_members for delete to authenticated using (public.has_role(organization_id, array['admin']));

-- 4. Clients / Suppliers / Products
alter table public.clients
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists unit_id uuid references public.units(id),
  add column if not exists legal_name text, add column if not exists cnpj text,
  add column if not exists address text, add column if not exists contact_name text,
  add column if not exists contact_phone text, add column if not exists contact_email text;
alter table public.suppliers
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists unit_id uuid references public.units(id),
  add column if not exists legal_name text, add column if not exists cnpj text,
  add column if not exists address text, add column if not exists contact_name text,
  add column if not exists contact_phone text, add column if not exists contact_email text;
alter table public.products
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists supplier_id uuid references public.suppliers(id),
  add column if not exists name text,
  add column if not exists unit_of_measure text default 'un',
  add column if not exists tax_rate numeric(8,4);

update public.products set name = description where name is null;
update public.clients   set organization_id = '00000000-0000-0000-0000-00000000m4st'::uuid where organization_id is null;
update public.suppliers set organization_id = '00000000-0000-0000-0000-00000000m4st'::uuid where organization_id is null;
update public.products  set organization_id = '00000000-0000-0000-0000-00000000m4st'::uuid where organization_id is null;

create index if not exists idx_clients_org_unit   on public.clients(organization_id, unit_id);
create index if not exists idx_suppliers_org_unit on public.suppliers(organization_id, unit_id);
create index if not exists idx_products_org       on public.products(organization_id);
create index if not exists idx_products_supplier  on public.products(supplier_id);

do $$ declare t text;
begin
  foreach t in array array['clients','suppliers','products'] loop
    execute format('drop policy if exists "authenticated_select_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "authenticated_insert_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "authenticated_update_%1$s" on public.%1$s', t);
    execute format($f$create policy "%1$s_select" on public.%1$s for select to authenticated
      using (organization_id is null or public.is_member_of_organization(organization_id))$f$, t);
    execute format($f$create policy "%1$s_insert" on public.%1$s for insert to authenticated
      with check (public.is_member_of_organization(organization_id))$f$, t);
    execute format($f$create policy "%1$s_update" on public.%1$s for update to authenticated
      using (public.has_role(organization_id, array['admin','gestor','comercial']))
      with check (public.is_member_of_organization(organization_id))$f$, t);
    execute format($f$create policy "%1$s_delete" on public.%1$s for delete to authenticated
      using (public.has_role(organization_id, array['admin','gestor']))$f$, t);
  end loop;
end$$;

-- 5. Negociações
alter table public.negotiations
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists notes text,
  add column if not exists expected_value numeric(14,2) default 0;
update public.negotiations set organization_id = '00000000-0000-0000-0000-00000000m4st'::uuid where organization_id is null;
create index if not exists idx_negotiations_org_unit on public.negotiations(organization_id, unit_id);
create index if not exists idx_negotiations_client   on public.negotiations(client_id);
create index if not exists idx_negotiations_status   on public.negotiations(status);
drop policy if exists "authenticated_select_negotiations" on public.negotiations;
drop policy if exists "authenticated_insert_negotiations" on public.negotiations;
drop policy if exists "authenticated_update_negotiations" on public.negotiations;
create policy "negotiations_select" on public.negotiations for select to authenticated
  using (organization_id is null or public.is_member_of_organization(organization_id));
create policy "negotiations_insert" on public.negotiations for insert to authenticated
  with check (public.is_member_of_organization(organization_id));
create policy "negotiations_update" on public.negotiations for update to authenticated
  using (public.has_role(organization_id, array['admin','gestor','comercial','aprovador']))
  with check (public.is_member_of_organization(organization_id));
create policy "negotiations_delete" on public.negotiations for delete to authenticated
  using (public.has_role(organization_id, array['admin','gestor']));

-- 6. Simulações
alter table public.simulations
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists responsible_user_id uuid references auth.users(id),
  add column if not exists viability_status text default 'pending',
  add column if not exists minimum_margin numeric(8,4) default 0.12,
  add column if not exists adjusted_cost_total numeric(14,2) default 0,
  add column if not exists markup numeric(8,4),
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists created_by uuid references auth.users(id);
update public.simulations set organization_id = '00000000-0000-0000-0000-00000000m4st'::uuid where organization_id is null;
create index if not exists idx_simulations_org_unit on public.simulations(organization_id, unit_id);
create index if not exists idx_simulations_client   on public.simulations(client_id);
create index if not exists idx_simulations_status   on public.simulations(status);
create index if not exists idx_simulations_viab     on public.simulations(viability_status);
create index if not exists idx_simulations_created  on public.simulations(created_at desc);

drop policy if exists "authenticated_select_simulations" on public.simulations;
drop policy if exists "authenticated_insert_simulations" on public.simulations;
drop policy if exists "authenticated_update_simulations" on public.simulations;
create policy "simulations_select" on public.simulations for select to authenticated
  using (organization_id is null or public.is_member_of_organization(organization_id));
create policy "simulations_insert" on public.simulations for insert to authenticated
  with check (public.is_member_of_organization(organization_id));
create policy "simulations_update" on public.simulations for update to authenticated
  using (public.has_role(organization_id, array['admin','gestor','comercial','aprovador']))
  with check (public.is_member_of_organization(organization_id));
create policy "simulations_delete" on public.simulations for delete to authenticated
  using (public.has_role(organization_id, array['admin','gestor']));

do $$ declare t text;
begin
  foreach t in array array['simulation_items','simulation_costs','simulation_purchase_costs','simulation_installments'] loop
    execute format('drop policy if exists "authenticated_select_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "authenticated_insert_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "authenticated_update_%1$s" on public.%1$s', t);
    execute format('drop policy if exists "authenticated_delete_%1$s" on public.%1$s', t);
    execute format($f$create policy "%1$s_select" on public.%1$s for select to authenticated
      using (exists (select 1 from public.simulations s where s.id = %1$s.simulation_id
        and (s.organization_id is null or public.is_member_of_organization(s.organization_id))))$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$s for all to authenticated
      using (exists (select 1 from public.simulations s where s.id = %1$s.simulation_id
        and public.has_role(s.organization_id, array['admin','gestor','comercial'])))
      with check (exists (select 1 from public.simulations s where s.id = %1$s.simulation_id
        and public.is_member_of_organization(s.organization_id)))$f$, t);
  end loop;
end$$;

-- 7. Novas tabelas (spec)
create table if not exists public.purchase_components (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  type text not null check (type in ('merchandise','tax','insurance','complement','freight_purchase','other')),
  document_number text, supplier_id uuid references public.suppliers(id),
  supplier_name text, amount numeric(14,2) not null default 0,
  allocation_percentage numeric(8,4),
  allocation_method text default 'proportional_value' check (allocation_method in ('proportional_value','quantity','manual')),
  incorporates_cost boolean default true, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.simulation_expenses (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  type text not null check (type in ('freight','commission','fiscal_cost','financial_cost','taxes','pallets','loading_unloading','insurance','other')),
  calculation_type text not null check (calculation_type in ('fixed','percentage_revenue','percentage_cost','manual')),
  base_amount numeric(14,2), percentage numeric(8,4),
  amount numeric(14,2) not null default 0, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.simulation_payment_terms (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  bank_name text, payment_method text, account_description text,
  discount_percentage numeric(8,4), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.simulation_approvals (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','adjustment_requested','rejected','cancelled')),
  priority text default 'medium' check (priority in ('low','medium','high','critical')),
  requested_by uuid references auth.users(id), requested_at timestamptz default now(),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  comment text, adjustment_reason text,
  check_commercial_premises boolean default false, check_margin_validated boolean default false,
  check_costs_reviewed boolean default false, check_notes_registered boolean default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- 8. Pedidos
alter table public.orders
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists negotiation_id uuid references public.negotiations(id),
  add column if not exists responsible_user_id uuid references auth.users(id),
  add column if not exists origin_city text, add column if not exists origin_state text,
  add column if not exists destination_city text, add column if not exists destination_state text,
  add column if not exists modal text default 'road', add column if not exists incoterm text,
  add column if not exists merchandise_total numeric(14,2) default 0,
  add column if not exists freight_total numeric(14,2) default 0,
  add column if not exists expenses_total numeric(14,2) default 0,
  add column if not exists order_total numeric(14,2) default 0,
  add column if not exists billing_progress numeric(8,4) default 0,
  add column if not exists delivery_progress numeric(8,4) default 0,
  add column if not exists priority text default 'medium',
  add column if not exists created_by uuid references auth.users(id);
update public.orders set organization_id = '00000000-0000-0000-0000-00000000m4st'::uuid where organization_id is null;
create index if not exists idx_orders_org_unit on public.orders(organization_id, unit_id);
create index if not exists idx_orders_client   on public.orders(client_id);
create index if not exists idx_orders_status   on public.orders(status);

drop policy if exists "authenticated_select_orders" on public.orders;
drop policy if exists "authenticated_insert_orders" on public.orders;
drop policy if exists "authenticated_update_orders" on public.orders;
create policy "orders_select" on public.orders for select to authenticated
  using (organization_id is null or public.is_member_of_organization(organization_id));
create policy "orders_insert" on public.orders for insert to authenticated
  with check (public.is_member_of_organization(organization_id));
create policy "orders_update" on public.orders for update to authenticated
  using (public.has_role(organization_id, array['admin','gestor','comercial','financeiro','frota']))
  with check (public.is_member_of_organization(organization_id));
create policy "orders_delete" on public.orders for delete to authenticated
  using (public.has_role(organization_id, array['admin','gestor']));

drop policy if exists "authenticated_select_order_items" on public.order_items;
drop policy if exists "authenticated_insert_order_items" on public.order_items;
drop policy if exists "authenticated_update_order_items" on public.order_items;
drop policy if exists "authenticated_delete_order_items" on public.order_items;
create policy "order_items_select" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id
    and (o.organization_id is null or public.is_member_of_organization(o.organization_id))));
create policy "order_items_write" on public.order_items for all to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id
    and public.has_role(o.organization_id, array['admin','gestor','comercial','financeiro'])))
  with check (exists (select 1 from public.orders o where o.id = order_items.order_id
    and public.is_member_of_organization(o.organization_id)));

create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null, description text,
  event_date timestamptz not null default now(),
  created_by uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_status_events_order on public.order_status_events(order_id);

-- 9. Documents / Financial / Freights / Deliveries / Sequences
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid references public.units(id),
  entity_type text not null check (entity_type in ('simulation','approval','order','freight','delivery','client','supplier')),
  entity_id uuid not null, document_type text,
  file_name text not null, file_path text, mime_type text, file_size bigint,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_documents_entity on public.documents(entity_type, entity_id);
create index if not exists idx_documents_org    on public.documents(organization_id);

create table if not exists public.financial_titles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid references public.units(id),
  order_id uuid references public.orders(id),
  client_id uuid references public.clients(id),
  type text not null check (type in ('receivable','payable')),
  document_number text, amount numeric(14,2), due_date date, paid_at timestamptz,
  status text default 'open' check (status in ('open','paid','overdue','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_fin_titles_org    on public.financial_titles(organization_id);
create index if not exists idx_fin_titles_order  on public.financial_titles(order_id);
create index if not exists idx_fin_titles_status on public.financial_titles(status);

create table if not exists public.freights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid references public.units(id),
  order_id uuid references public.orders(id),
  carrier_name text, driver_name text, vehicle_plate text, trailer_plate text, antt text,
  freight_value numeric(14,2),
  status text default 'quoted' check (status in ('quoted','hired','loading','in_route','delivered','cancelled')),
  pickup_date timestamptz, expected_delivery_date timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_freights_org   on public.freights(organization_id);
create index if not exists idx_freights_order on public.freights(order_id);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid references public.units(id),
  order_id uuid references public.orders(id),
  freight_id uuid references public.freights(id),
  status text default 'pending' check (status in ('pending','loading','loaded','in_route','arrived','delivered','issue','cancelled')),
  current_location text, delivered_at timestamptz,
  proof_document_id uuid references public.documents(id), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_deliveries_org   on public.deliveries(organization_id);
create index if not exists idx_deliveries_order on public.deliveries(order_id);

create table if not exists public.document_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  unit_id uuid references public.units(id),
  document_type text not null check (document_type in ('NEG','SIM','PED','FR')),
  year integer not null, current_number integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, unit_id, document_type, year)
);

create or replace function public.next_document_code(_unit_id uuid, _document_type text)
returns text language plpgsql security definer set search_path = public as $$
declare _org uuid; _year integer := extract(year from now())::int; _next integer;
begin
  select organization_id into _org from public.units where id = _unit_id;
  if _org is null then raise exception 'Unidade % não encontrada', _unit_id; end if;
  insert into public.document_sequences (organization_id, unit_id, document_type, year, current_number)
    values (_org, _unit_id, _document_type, _year, 1)
  on conflict (organization_id, unit_id, document_type, year)
    do update set current_number = public.document_sequences.current_number + 1, updated_at = now()
    returning current_number into _next;
  return format('%s-%s-%s', _document_type, _year, lpad(_next::text, 4, '0'));
end;
$$;

-- 10. Audit & Notifications
alter table public.audit_events
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists unit_id uuid references public.units(id),
  add column if not exists user_id uuid references auth.users(id);
alter table public.notifications
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists unit_id uuid references public.units(id),
  add column if not exists user_id uuid references auth.users(id);
update public.audit_events  set organization_id = '00000000-0000-0000-0000-00000000m4st'::uuid where organization_id is null;
update public.notifications set organization_id = '00000000-0000-0000-0000-00000000m4st'::uuid where organization_id is null;

-- 11. GRANTs + RLS para tabelas novas + triggers updated_at
do $$ declare t text;
begin
  foreach t in array array[
    'purchase_components','simulation_expenses','simulation_payment_terms',
    'simulation_approvals','order_status_events','documents','financial_titles',
    'freights','deliveries','document_sequences'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end$$;

do $$ declare t text;
begin
  foreach t in array array[
    'purchase_components','simulation_expenses','simulation_payment_terms',
    'simulation_approvals','documents','financial_titles','freights','deliveries',
    'document_sequences','organization_members'] loop
    if exists (select 1 from information_schema.columns
                where table_schema='public' and table_name=t and column_name='updated_at') then
      execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
      execute format('create trigger trg_%1$s_updated_at before update on public.%1$s
                      for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end$$;

do $$ declare t text;
begin
  foreach t in array array['purchase_components','simulation_expenses','simulation_payment_terms','simulation_approvals'] loop
    execute format($f$create policy "%1$s_select" on public.%1$s for select to authenticated
      using (exists (select 1 from public.simulations s where s.id = %1$s.simulation_id
        and (s.organization_id is null or public.is_member_of_organization(s.organization_id))))$f$, t);
    execute format($f$create policy "%1$s_write" on public.%1$s for all to authenticated
      using (exists (select 1 from public.simulations s where s.id = %1$s.simulation_id
        and public.has_role(s.organization_id, array['admin','gestor','comercial','aprovador'])))
      with check (exists (select 1 from public.simulations s where s.id = %1$s.simulation_id
        and public.is_member_of_organization(s.organization_id)))$f$, t);
  end loop;
end$$;

create policy "order_status_events_select" on public.order_status_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_events.order_id
    and (o.organization_id is null or public.is_member_of_organization(o.organization_id))));
create policy "order_status_events_write" on public.order_status_events for all to authenticated
  using (exists (select 1 from public.orders o where o.id = order_status_events.order_id
    and public.has_role(o.organization_id, array['admin','gestor','comercial','financeiro','frota'])))
  with check (exists (select 1 from public.orders o where o.id = order_status_events.order_id
    and public.is_member_of_organization(o.organization_id)));

do $$ declare t text;
begin
  foreach t in array array['documents','financial_titles','freights','deliveries','document_sequences'] loop
    execute format($f$create policy "%1$s_select" on public.%1$s for select to authenticated
      using (public.is_member_of_organization(organization_id))$f$, t);
    execute format($f$create policy "%1$s_insert" on public.%1$s for insert to authenticated
      with check (public.is_member_of_organization(organization_id))$f$, t);
    execute format($f$create policy "%1$s_update" on public.%1$s for update to authenticated
      using (public.has_role(organization_id, array['admin','gestor','comercial','financeiro','frota']))
      with check (public.is_member_of_organization(organization_id))$f$, t);
    execute format($f$create policy "%1$s_delete" on public.%1$s for delete to authenticated
      using (public.has_role(organization_id, array['admin','gestor']))$f$, t);
  end loop;
end$$;

drop policy if exists "authenticated_select_audit_events" on public.audit_events;
drop policy if exists "authenticated_insert_audit_events" on public.audit_events;
create policy "audit_events_select" on public.audit_events for select to authenticated
  using (organization_id is null or public.is_member_of_organization(organization_id));
create policy "audit_events_insert" on public.audit_events for insert to authenticated
  with check (organization_id is null or public.is_member_of_organization(organization_id));

drop policy if exists "authenticated_select_notifications" on public.notifications;
drop policy if exists "authenticated_insert_notifications" on public.notifications;
drop policy if exists "authenticated_update_notifications" on public.notifications;
create policy "notifications_select" on public.notifications for select to authenticated
  using (user_id is null or user_id = auth.uid()
         or (organization_id is not null and public.has_role(organization_id, array['admin','gestor'])));
create policy "notifications_insert" on public.notifications for insert to authenticated
  with check (organization_id is null or public.is_member_of_organization(organization_id));
create policy "notifications_update" on public.notifications for update to authenticated
  using (user_id = auth.uid() or public.has_role(organization_id, array['admin','gestor']));

-- 12. Views resumo
create or replace view public.simulation_summary_view as
select s.id, s.organization_id, s.unit_id, s.number, s.status, s.viability_status,
       s.revenue_total, coalesce(s.merchandise_cost_total,0) as merchandise_cost_total,
       coalesce(s.expenses_total,0) as expenses_total,
       coalesce(s.gross_profit,0) as gross_profit, coalesce(s.net_profit,0) as net_profit,
       s.net_margin, s.created_at, s.updated_at,
       c.name as client_name, sup.name as supplier_name, u.name as unit_name,
       p.full_name as responsible_name
from public.simulations s
left join public.clients   c   on c.id = s.client_id
left join public.suppliers sup on sup.id = s.supplier_id
left join public.units     u   on u.id = s.unit_id
left join public.profiles  p   on p.auth_user_id = s.responsible_user_id;

create or replace view public.order_summary_view as
select o.id, o.organization_id, o.unit_id, o.number, o.status, o.priority,
       o.origin_city, o.origin_state, o.destination_city, o.destination_state,
       o.order_total, o.billing_progress, o.delivery_progress, o.created_at, o.updated_at,
       c.name as client_name, u.name as unit_name, p.full_name as responsible_name
from public.orders o
left join public.clients  c on c.id = o.client_id
left join public.units    u on u.id = o.unit_id
left join public.profiles p on p.auth_user_id = o.responsible_user_id;

grant select on public.simulation_summary_view to authenticated;
grant select on public.order_summary_view to authenticated;

-- 13. Storage bucket (best-effort)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('master-flow-documents','master-flow-documents', false)
    on conflict (id) do nothing;
  end if;
exception when others then null;
end$$;
