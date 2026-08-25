-- Nome da alteração: Onda 1 - permissões da carteira e do pool de oportunidades
-- Objetivo: ocultar valores gerenciais do Comercial, deixar Gestor/Financeiro em
-- consulta e permitir que somente o Admin encerre/transfira carteiras ou movimente o pool.
-- Dependências: migrations 202607070001/002 e SQL 026.
-- Como usar: executar manualmente no SQL Editor do Supabase.
-- Risco: baixo/moderado; troca somente políticas RLS e cria uma função de abertura segura.

begin;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname, tablename
      from pg_policies
     where schemaname = 'public'
       and tablename in (
         'negotiation_wallets',
         'negotiation_wallet_entries',
         'opportunity_pools',
         'opportunity_pool_entries'
       )
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_record.policyname,
      policy_record.tablename
    );
  end loop;
end $$;

alter table public.negotiation_wallets enable row level security;
alter table public.negotiation_wallet_entries enable row level security;
alter table public.opportunity_pools enable row level security;
alter table public.opportunity_pool_entries enable row level security;

-- Carteiras: Gestor e Financeiro consultam. Frete tem leitura técnica porque os
-- lançamentos automáticos de economia/estouro ainda são feitos pelo frontend.
create policy wallet_management_can_read
on public.negotiation_wallets
for select to authenticated
using (exists (
  select 1
    from public.organization_members om
   where om.organization_id = negotiation_wallets.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) in ('admin', 'gestor', 'financeiro', 'frete', 'frota')
));

create policy wallet_admin_can_insert
on public.negotiation_wallets
for insert to authenticated
with check (exists (
  select 1
    from public.organization_members om
   where om.organization_id = negotiation_wallets.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) = 'admin'
));

create policy wallet_operations_can_update_open_wallets
on public.negotiation_wallets
for update to authenticated
using (
  status in ('open', 'locked')
  and exists (
    select 1
      from public.organization_members om
     where om.organization_id = negotiation_wallets.organization_id
       and om.user_id = auth.uid()
       and lower(coalesce(om.role, '')) in ('admin', 'financeiro', 'frete', 'frota')
  )
)
with check (
  status in ('open', 'locked')
  and exists (
    select 1
      from public.organization_members om
     where om.organization_id = negotiation_wallets.organization_id
       and om.user_id = auth.uid()
       and lower(coalesce(om.role, '')) in ('admin', 'financeiro', 'frete', 'frota')
  )
);

create policy wallet_admin_can_update_any_status
on public.negotiation_wallets
for update to authenticated
using (exists (
  select 1
    from public.organization_members om
   where om.organization_id = negotiation_wallets.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) = 'admin'
))
with check (exists (
  select 1
    from public.organization_members om
   where om.organization_id = negotiation_wallets.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) = 'admin'
));

create policy wallet_admin_can_delete
on public.negotiation_wallets
for delete to authenticated
using (exists (
  select 1
    from public.organization_members om
   where om.organization_id = negotiation_wallets.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) = 'admin'
));

-- Extrato: os módulos Financeiro e Frete continuam gravando lançamentos
-- automáticos. O Gestor permanece somente em consulta.
create policy wallet_entries_management_can_read
on public.negotiation_wallet_entries
for select to authenticated
using (exists (
  select 1
    from public.organization_members om
   where om.organization_id = negotiation_wallet_entries.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) in ('admin', 'gestor', 'financeiro', 'frete', 'frota')
));

create policy wallet_entries_operations_can_write
on public.negotiation_wallet_entries
for all to authenticated
using (exists (
  select 1
    from public.organization_members om
   where om.organization_id = negotiation_wallet_entries.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) in ('admin', 'financeiro', 'frete', 'frota')
))
with check (exists (
  select 1
    from public.organization_members om
   where om.organization_id = negotiation_wallet_entries.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) in ('admin', 'financeiro', 'frete', 'frota')
));

-- Pool: Admin movimenta; Gestor e Financeiro apenas consultam.
create policy opportunity_pool_management_can_read
on public.opportunity_pools
for select to authenticated
using (exists (
  select 1
    from public.organization_members om
   where om.organization_id = opportunity_pools.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) in ('admin', 'gestor', 'financeiro')
));

create policy opportunity_pool_admin_can_manage
on public.opportunity_pools
for all to authenticated
using (exists (
  select 1
    from public.organization_members om
   where om.organization_id = opportunity_pools.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) = 'admin'
))
with check (exists (
  select 1
    from public.organization_members om
   where om.organization_id = opportunity_pools.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) = 'admin'
));

create policy opportunity_pool_entries_management_can_read
on public.opportunity_pool_entries
for select to authenticated
using (exists (
  select 1
    from public.organization_members om
   where om.organization_id = opportunity_pool_entries.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) in ('admin', 'gestor', 'financeiro')
));

create policy opportunity_pool_entries_admin_can_manage
on public.opportunity_pool_entries
for all to authenticated
using (exists (
  select 1
    from public.organization_members om
   where om.organization_id = opportunity_pool_entries.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) = 'admin'
))
with check (exists (
  select 1
    from public.organization_members om
   where om.organization_id = opportunity_pool_entries.organization_id
     and om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) = 'admin'
));

-- O Comercial cria o pedido, mas não pode ler a carteira. Esta função abre a
-- carteira no backend usando o lucro calculado e já persistido na simulação.
create or replace function public.create_negotiation_wallet_for_order(
  p_wallet_external_id text,
  p_simulation_external_id text,
  p_order_external_id text,
  p_opened_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_order_id uuid;
  v_simulation_id uuid;
  v_expected_profit numeric(14,2);
begin
  select om.organization_id
    into v_organization_id
    from public.organization_members om
   where om.user_id = auth.uid()
     and lower(coalesce(om.role, '')) in ('admin', 'comercial')
   limit 1;

  if v_organization_id is null then
    raise exception 'Usuário sem permissão para abrir carteira de negociação.'
      using errcode = '42501';
  end if;

  select o.id
    into v_order_id
    from public.orders o
   where o.external_id = p_order_external_id
     and (o.organization_id = v_organization_id or o.organization_id is null)
   limit 1;

  if v_order_id is null then
    raise exception 'Pedido não encontrado na organização do usuário.'
      using errcode = 'P0002';
  end if;

  select s.id, round(coalesce(s.net_profit, 0)::numeric, 2)
    into v_simulation_id, v_expected_profit
    from public.simulations s
   where s.external_id = p_simulation_external_id
     and (s.organization_id = v_organization_id or s.organization_id is null)
   limit 1;

  if v_simulation_id is null then
    raise exception 'Simulação de origem não encontrada.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
      from public.negotiation_wallets nw
     where nw.organization_id = v_organization_id
       and (nw.external_id = p_wallet_external_id or nw.order_id = v_order_id)
  ) then
    return;
  end if;

  insert into public.negotiation_wallets (
    external_id,
    organization_id,
    simulation_id,
    simulation_external_id,
    order_id,
    order_external_id,
    initial_expected_profit,
    current_balance,
    status,
    opened_at,
    created_at,
    updated_at
  ) values (
    p_wallet_external_id,
    v_organization_id,
    v_simulation_id,
    p_simulation_external_id,
    v_order_id,
    p_order_external_id,
    v_expected_profit,
    v_expected_profit,
    'open',
    coalesce(p_opened_at, now()),
    now(),
    now()
  );
end;
$$;

revoke all on function public.create_negotiation_wallet_for_order(text, text, text, timestamptz)
from public;
grant execute on function public.create_negotiation_wallet_for_order(text, text, text, timestamptz)
to authenticated;

commit;
