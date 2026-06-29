create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  city text,
  state text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  name text not null,
  email text unique not null,
  role text not null default 'Comercial',
  unit_id uuid references public.units(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  code text,
  name text not null,
  document text,
  city text,
  state text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  code text,
  name text not null,
  document text,
  city text,
  state text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  code text not null,
  description text not null,
  brand text,
  category text,
  unit_label text,
  units_per_box numeric not null default 1,
  default_unit_cost numeric,
  default_sale_unit numeric,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.negotiations (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  number text unique not null,
  client_id uuid references public.clients(id),
  responsible_id uuid references public.profiles(id),
  unit_id uuid references public.units(id),
  current_stage text not null default 'Simulação',
  status text not null default 'Aberta',
  total_value numeric not null default 0,
  expected_margin numeric not null default 0,
  next_action text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.simulations (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  number text unique not null,
  negotiation_id uuid references public.negotiations(id),
  client_id uuid references public.clients(id),
  supplier_id uuid references public.suppliers(id),
  responsible_id uuid references public.profiles(id),
  unit_id uuid references public.units(id),
  client_name text,
  supplier_name text,
  responsible_name text,
  unit_name text,
  delivery_city text,
  delivery_state text,
  payment_condition text,
  expected_delivery_date date,
  valid_until timestamptz,
  status text not null default 'Rascunho',
  priority text not null default 'Média',
  viability_status text not null default 'Pendente',
  revenue_total numeric not null default 0,
  goods_cost_total numeric not null default 0,
  expenses_total numeric not null default 0,
  gross_profit numeric not null default 0,
  net_profit numeric not null default 0,
  net_margin numeric not null default 0,
  minimum_margin numeric not null default 12,
  notes text,
  financial_notes text,
  financial jsonb not null default '{}'::jsonb,
  approval_checklist jsonb,
  approval_notes text,
  submitted_at timestamptz,
  approved_at timestamptz,
  converted_order_id uuid,
  converted_order_external_id text,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.simulation_items (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  product_id uuid references public.products(id),
  product_code text,
  product_description text not null,
  boxes_quantity numeric not null default 0,
  units_per_box numeric not null default 0,
  total_units numeric not null default 0,
  unit_cost numeric not null default 0,
  adjusted_unit_cost numeric,
  invoice_price numeric,
  sale_unit_price numeric not null default 0,
  cost_total numeric not null default 0,
  sale_total numeric not null default 0,
  gross_profit numeric not null default 0,
  margin numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (simulation_id, external_id)
);

create table if not exists public.simulation_costs (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  type text not null,
  description text,
  calculation_method text not null default 'fixed',
  calculation_base text,
  percentage numeric,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (simulation_id, external_id)
);

create table if not exists public.simulation_purchase_costs (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  type text not null,
  document text,
  supplier text,
  amount numeric not null default 0,
  allocation_percent numeric not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (simulation_id, external_id)
);

create table if not exists public.simulation_installments (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  installment_number integer not null,
  due_days integer not null default 0,
  due_date date,
  amount numeric not null default 0,
  bank text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (simulation_id, installment_number)
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  approver_id uuid references public.profiles(id),
  status text not null default 'pending',
  checklist jsonb not null default '{}'::jsonb,
  comment text,
  requested_changes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  number text unique not null,
  simulation_id uuid references public.simulations(id),
  simulation_external_id text,
  negotiation_id uuid references public.negotiations(id),
  client_id uuid references public.clients(id),
  responsible_id uuid references public.profiles(id),
  unit_id uuid references public.units(id),
  client_name text,
  responsible_name text,
  unit_name text,
  status text not null default 'Aguardando faturamento',
  priority text not null default 'Média',
  origin text,
  destination text,
  total_value numeric not null default 0,
  goods_total numeric not null default 0,
  freight_total numeric not null default 0,
  expenses_total numeric not null default 0,
  billing_progress numeric not null default 0,
  delivery_progress numeric not null default 0,
  payment_terms text,
  logistics_status text,
  documents text[] not null default '{}',
  notes text[] not null default '{}',
  timeline jsonb not null default '[]'::jsonb,
  expected_delivery_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.simulations
  add constraint simulations_converted_order_fk
  foreign key (converted_order_id) references public.orders(id);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_code text,
  product_description text not null,
  boxes_quantity numeric not null default 0,
  units_per_box numeric not null default 0,
  total_units numeric not null default 0,
  unit_price numeric not null default 0,
  total_value numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, external_id)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  entity_type text not null,
  entity_id uuid,
  entity_external_id text,
  action text not null,
  description text not null,
  user_id uuid references public.profiles(id),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  user_id uuid references public.profiles(id),
  title text not null,
  message text not null,
  type text not null default 'info',
  read boolean not null default false,
  entity_type text,
  entity_id uuid,
  entity_external_id text,
  created_at timestamptz not null default now()
);

create index if not exists simulations_status_idx on public.simulations(status);
create index if not exists simulations_external_id_idx on public.simulations(external_id);
create index if not exists orders_external_id_idx on public.orders(external_id);
create index if not exists orders_simulation_external_id_idx on public.orders(simulation_external_id);
create index if not exists approvals_simulation_id_idx on public.approvals(simulation_id);
create index if not exists audit_events_entity_idx on public.audit_events(entity_type, entity_external_id);
create index if not exists notifications_user_read_idx on public.notifications(user_id, read);

create trigger units_set_updated_at before update on public.units for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger suppliers_set_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger negotiations_set_updated_at before update on public.negotiations for each row execute function public.set_updated_at();
create trigger simulations_set_updated_at before update on public.simulations for each row execute function public.set_updated_at();
create trigger simulation_items_set_updated_at before update on public.simulation_items for each row execute function public.set_updated_at();
create trigger simulation_costs_set_updated_at before update on public.simulation_costs for each row execute function public.set_updated_at();
create trigger simulation_purchase_costs_set_updated_at before update on public.simulation_purchase_costs for each row execute function public.set_updated_at();
create trigger simulation_installments_set_updated_at before update on public.simulation_installments for each row execute function public.set_updated_at();
create trigger approvals_set_updated_at before update on public.approvals for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger order_items_set_updated_at before update on public.order_items for each row execute function public.set_updated_at();

alter table public.units enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.negotiations enable row level security;
alter table public.simulations enable row level security;
alter table public.simulation_items enable row level security;
alter table public.simulation_costs enable row level security;
alter table public.simulation_purchase_costs enable row level security;
alter table public.simulation_installments enable row level security;
alter table public.approvals enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.audit_events enable row level security;
alter table public.notifications enable row level security;

create policy "authenticated_select_units" on public.units for select to authenticated using (true);
create policy "authenticated_insert_units" on public.units for insert to authenticated with check (true);
create policy "authenticated_update_units" on public.units for update to authenticated using (true) with check (true);
create policy "authenticated_select_profiles" on public.profiles for select to authenticated using (true);
create policy "authenticated_insert_profiles" on public.profiles for insert to authenticated with check (true);
create policy "authenticated_update_profiles" on public.profiles for update to authenticated using (true) with check (true);
create policy "authenticated_select_clients" on public.clients for select to authenticated using (true);
create policy "authenticated_insert_clients" on public.clients for insert to authenticated with check (true);
create policy "authenticated_update_clients" on public.clients for update to authenticated using (true) with check (true);
create policy "authenticated_select_suppliers" on public.suppliers for select to authenticated using (true);
create policy "authenticated_insert_suppliers" on public.suppliers for insert to authenticated with check (true);
create policy "authenticated_update_suppliers" on public.suppliers for update to authenticated using (true) with check (true);
create policy "authenticated_select_products" on public.products for select to authenticated using (true);
create policy "authenticated_insert_products" on public.products for insert to authenticated with check (true);
create policy "authenticated_update_products" on public.products for update to authenticated using (true) with check (true);
create policy "authenticated_select_negotiations" on public.negotiations for select to authenticated using (true);
create policy "authenticated_insert_negotiations" on public.negotiations for insert to authenticated with check (true);
create policy "authenticated_update_negotiations" on public.negotiations for update to authenticated using (true) with check (true);
create policy "authenticated_select_simulations" on public.simulations for select to authenticated using (true);
create policy "authenticated_insert_simulations" on public.simulations for insert to authenticated with check (true);
create policy "authenticated_update_simulations" on public.simulations for update to authenticated using (true) with check (true);
create policy "authenticated_select_simulation_items" on public.simulation_items for select to authenticated using (true);
create policy "authenticated_insert_simulation_items" on public.simulation_items for insert to authenticated with check (true);
create policy "authenticated_update_simulation_items" on public.simulation_items for update to authenticated using (true) with check (true);
create policy "authenticated_delete_simulation_items" on public.simulation_items for delete to authenticated using (true);
create policy "authenticated_select_simulation_costs" on public.simulation_costs for select to authenticated using (true);
create policy "authenticated_insert_simulation_costs" on public.simulation_costs for insert to authenticated with check (true);
create policy "authenticated_update_simulation_costs" on public.simulation_costs for update to authenticated using (true) with check (true);
create policy "authenticated_delete_simulation_costs" on public.simulation_costs for delete to authenticated using (true);
create policy "authenticated_select_simulation_purchase_costs" on public.simulation_purchase_costs for select to authenticated using (true);
create policy "authenticated_insert_simulation_purchase_costs" on public.simulation_purchase_costs for insert to authenticated with check (true);
create policy "authenticated_update_simulation_purchase_costs" on public.simulation_purchase_costs for update to authenticated using (true) with check (true);
create policy "authenticated_delete_simulation_purchase_costs" on public.simulation_purchase_costs for delete to authenticated using (true);
create policy "authenticated_select_simulation_installments" on public.simulation_installments for select to authenticated using (true);
create policy "authenticated_insert_simulation_installments" on public.simulation_installments for insert to authenticated with check (true);
create policy "authenticated_update_simulation_installments" on public.simulation_installments for update to authenticated using (true) with check (true);
create policy "authenticated_delete_simulation_installments" on public.simulation_installments for delete to authenticated using (true);
create policy "authenticated_select_approvals" on public.approvals for select to authenticated using (true);
create policy "authenticated_insert_approvals" on public.approvals for insert to authenticated with check (true);
create policy "authenticated_update_approvals" on public.approvals for update to authenticated using (true) with check (true);
create policy "authenticated_select_orders" on public.orders for select to authenticated using (true);
create policy "authenticated_insert_orders" on public.orders for insert to authenticated with check (true);
create policy "authenticated_update_orders" on public.orders for update to authenticated using (true) with check (true);
create policy "authenticated_select_order_items" on public.order_items for select to authenticated using (true);
create policy "authenticated_insert_order_items" on public.order_items for insert to authenticated with check (true);
create policy "authenticated_update_order_items" on public.order_items for update to authenticated using (true) with check (true);
create policy "authenticated_delete_order_items" on public.order_items for delete to authenticated using (true);
create policy "authenticated_select_audit_events" on public.audit_events for select to authenticated using (true);
create policy "authenticated_insert_audit_events" on public.audit_events for insert to authenticated with check (true);
create policy "authenticated_select_notifications" on public.notifications for select to authenticated using (true);
create policy "authenticated_insert_notifications" on public.notifications for insert to authenticated with check (true);
create policy "authenticated_update_notifications" on public.notifications for update to authenticated using (true) with check (true);
