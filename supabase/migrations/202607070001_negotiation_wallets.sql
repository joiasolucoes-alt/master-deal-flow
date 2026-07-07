create table if not exists public.negotiation_wallets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  negotiation_id uuid null,
  simulation_id uuid null references public.simulations(id) on delete set null,
  order_id uuid null references public.orders(id) on delete set null,
  initial_expected_profit numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  final_balance numeric(14,2),
  status text not null default 'open' check (status in ('open','locked','closed','transferred','cancelled')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_id)
);

create table if not exists public.negotiation_wallet_entries (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.negotiation_wallets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  negotiation_id uuid null,
  order_id uuid null references public.orders(id) on delete set null,
  entry_type text not null default 'automatic',
  category text not null,
  source_module text not null,
  amount numeric(14,2) not null check (amount > 0),
  direction text not null check (direction in ('credit','debit')),
  description text not null,
  reference_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid null references public.profiles(id) on delete set null,
  reversal_reason text
);

create table if not exists public.opportunity_pools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  balance numeric(14,2) not null default 0,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunity_pool_entries (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.opportunity_pools(id) on delete cascade,
  wallet_id uuid null references public.negotiation_wallets(id) on delete set null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  direction text not null check (direction in ('credit','debit')),
  description text not null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.negotiation_wallets enable row level security;
alter table public.negotiation_wallet_entries enable row level security;
alter table public.opportunity_pools enable row level security;
alter table public.opportunity_pool_entries enable row level security;

create policy "organization members can read negotiation wallets" on public.negotiation_wallets for select using (exists (select 1 from public.organization_members om where om.organization_id = negotiation_wallets.organization_id and om.user_id = auth.uid()));
create policy "organization operators can manage negotiation wallets" on public.negotiation_wallets for all using (exists (select 1 from public.organization_members om where om.organization_id = negotiation_wallets.organization_id and om.user_id = auth.uid() and om.role in ('admin','gestor','financeiro'))) with check (exists (select 1 from public.organization_members om where om.organization_id = negotiation_wallets.organization_id and om.user_id = auth.uid() and om.role in ('admin','gestor','financeiro')));

create policy "organization members can read wallet entries" on public.negotiation_wallet_entries for select using (exists (select 1 from public.organization_members om where om.organization_id = negotiation_wallet_entries.organization_id and om.user_id = auth.uid()));
create policy "organization operators can insert wallet entries" on public.negotiation_wallet_entries for insert with check (exists (select 1 from public.organization_members om where om.organization_id = negotiation_wallet_entries.organization_id and om.user_id = auth.uid() and om.role in ('admin','gestor','financeiro','frota')));
create policy "organization operators can reverse wallet entries" on public.negotiation_wallet_entries for update using (exists (select 1 from public.organization_members om where om.organization_id = negotiation_wallet_entries.organization_id and om.user_id = auth.uid() and om.role in ('admin','gestor','financeiro'))) with check (exists (select 1 from public.organization_members om where om.organization_id = negotiation_wallet_entries.organization_id and om.user_id = auth.uid() and om.role in ('admin','gestor','financeiro')));

create policy "organization members can read opportunity pools" on public.opportunity_pools for select using (exists (select 1 from public.organization_members om where om.organization_id = opportunity_pools.organization_id and om.user_id = auth.uid()));
create policy "organization managers can manage opportunity pools" on public.opportunity_pools for all using (exists (select 1 from public.organization_members om where om.organization_id = opportunity_pools.organization_id and om.user_id = auth.uid() and om.role in ('admin','gestor','financeiro'))) with check (exists (select 1 from public.organization_members om where om.organization_id = opportunity_pools.organization_id and om.user_id = auth.uid() and om.role in ('admin','gestor','financeiro')));

create policy "organization members can read pool entries" on public.opportunity_pool_entries for select using (exists (select 1 from public.organization_members om where om.organization_id = opportunity_pool_entries.organization_id and om.user_id = auth.uid()));
create policy "organization managers can insert pool entries" on public.opportunity_pool_entries for insert with check (exists (select 1 from public.organization_members om where om.organization_id = opportunity_pool_entries.organization_id and om.user_id = auth.uid() and om.role in ('admin','gestor','financeiro')));
