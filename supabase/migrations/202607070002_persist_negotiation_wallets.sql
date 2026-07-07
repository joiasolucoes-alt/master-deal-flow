alter table public.negotiation_wallets
  add column if not exists external_id text,
  add column if not exists simulation_external_id text,
  add column if not exists order_external_id text;

alter table public.negotiation_wallet_entries
  add column if not exists external_id text,
  add column if not exists wallet_external_id text,
  add column if not exists simulation_external_id text,
  add column if not exists order_external_id text,
  add column if not exists created_by_text text,
  add column if not exists reversed_by_text text;

alter table public.opportunity_pools
  add column if not exists external_id text;

alter table public.opportunity_pool_entries
  add column if not exists external_id text,
  add column if not exists pool_external_id text,
  add column if not exists wallet_external_id text,
  add column if not exists created_by_text text;

create unique index if not exists negotiation_wallets_external_id_idx
  on public.negotiation_wallets(external_id)
  where external_id is not null;

create unique index if not exists negotiation_wallets_org_external_id_idx
  on public.negotiation_wallets(organization_id, external_id)
  where external_id is not null;

create unique index if not exists negotiation_wallet_entries_external_id_idx
  on public.negotiation_wallet_entries(external_id)
  where external_id is not null;

create index if not exists negotiation_wallet_entries_wallet_external_idx
  on public.negotiation_wallet_entries(wallet_external_id)
  where wallet_external_id is not null;

create unique index if not exists opportunity_pools_external_id_idx
  on public.opportunity_pools(external_id)
  where external_id is not null;

create unique index if not exists opportunity_pool_entries_external_id_idx
  on public.opportunity_pool_entries(external_id)
  where external_id is not null;

grant select, insert, update, delete on table
  public.negotiation_wallets,
  public.negotiation_wallet_entries,
  public.opportunity_pools,
  public.opportunity_pool_entries
to authenticated;

grant select, insert, update, delete on table
  public.negotiation_wallets,
  public.negotiation_wallet_entries,
  public.opportunity_pools,
  public.opportunity_pool_entries
to service_role;

create or replace function public.get_my_master_flow_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_memberships jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('profile', null, 'memberships', '[]'::jsonb);
  end if;

  select *
    into v_profile
    from public.profiles
   where auth_user_id = auth.uid()
   limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'organization_id', m.organization_id,
        'unit_id', m.unit_id,
        'user_id', m.user_id,
        'role', m.role,
        'organizations',
          case
            when o.id is null then null
            else jsonb_build_object('id', o.id, 'name', o.name)
          end,
        'units',
          case
            when u.id is null then null
            else jsonb_build_object('id', u.id, 'name', u.name)
          end
      )
      order by
        case m.role
          when 'admin' then 1
          when 'gestor' then 2
          when 'aprovador' then 3
          when 'financeiro' then 4
          when 'comercial' then 5
          else 9
        end,
        m.created_at
    ),
    '[]'::jsonb
  )
    into v_memberships
    from public.organization_members m
    left join public.organizations o on o.id = m.organization_id
    left join public.units u on u.id = m.unit_id
   where m.user_id = auth.uid()
      or (v_profile.id is not null and m.user_id = v_profile.id);

  return jsonb_build_object(
    'profile',
      case
        when v_profile.id is null then null
        else jsonb_build_object(
          'id', v_profile.id,
          'auth_user_id', v_profile.auth_user_id,
          'full_name', v_profile.full_name,
          'name', v_profile.name,
          'email', v_profile.email,
          'role', v_profile.role,
          'unit_id', v_profile.unit_id,
          'default_unit_id', v_profile.default_unit_id
        )
      end,
    'memberships', v_memberships
  );
end;
$$;

revoke all on function public.get_my_master_flow_context() from public;
grant execute on function public.get_my_master_flow_context() to authenticated, service_role;
