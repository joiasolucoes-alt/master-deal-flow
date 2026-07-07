-- Onda 1.4 - auto cadastro comercial
-- Objetivo: permitir que um usuario autenticado crie seu proprio perfil
-- e entre na organizacao padrao como Comercial.
-- Como usar: execute depois dos scripts multiempresa/RLS.
-- Observacao: para entrar sem confirmacao de e-mail, desative a confirmacao
-- no painel Supabase Auth se essa for a regra desejada para o ambiente.

create or replace function public.register_current_user_as_comercial()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_name text;
  v_org_id uuid;
  v_unit_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', email)
    into v_email, v_name
  from auth.users
  where id = v_user_id;

  select id
    into v_org_id
  from public.organizations
  order by created_at asc nulls last, name asc
  limit 1;

  if v_org_id is null then
    raise exception 'Nenhuma organizacao cadastrada no Master Flow.';
  end if;

  select id
    into v_unit_id
  from public.units
  where organization_id = v_org_id
  order by case when name ilike '%matriz%' then 0 else 1 end, name asc
  limit 1;

  insert into public.profiles (auth_user_id, full_name, name, email, role, default_unit_id)
  values (v_user_id, v_name, v_name, v_email, 'Comercial', v_unit_id)
  on conflict (auth_user_id) do update set
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    name = coalesce(public.profiles.name, excluded.name),
    email = coalesce(public.profiles.email, excluded.email),
    role = coalesce(public.profiles.role, 'Comercial'),
    default_unit_id = coalesce(public.profiles.default_unit_id, excluded.default_unit_id),
    updated_at = now();

  insert into public.organization_members (organization_id, unit_id, user_id, role)
  values (v_org_id, v_unit_id, v_user_id, 'comercial')
  on conflict do nothing;
end;
$$;

grant execute on function public.register_current_user_as_comercial() to authenticated;
