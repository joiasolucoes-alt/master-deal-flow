# Plano: Schema Supabase do Master Flow

Vou criar a estrutura de banco completa em **migrations organizadas por domínio**, ativando RLS, funções auxiliares, triggers, views e seeds — sem destruir nada existente.

## Estratégia geral

- Cada migration cobre um domínio coeso. Ordem importa por causa de FKs.
- Toda tabela `public.*` recebe `GRANT` + `ENABLE RLS` + policies no mesmo arquivo.
- Funções de RLS usam `security definer` + `set search_path = public` para evitar recursão.
- Triggers `set_updated_at` aplicados em todas as tabelas com `updated_at`.
- Seeds em `supabase/seed.sql` (idempotentes via `on conflict`). Sem vincular `auth.users` (não temos uid garantido).
- Frontend: **não vou reescrever telas** nesta rodada. Vou apenas adicionar `src/repositories/supabase/*` esqueletos quando útil, mantendo a store local intacta como fallback. Critério de aceite exige "não quebrar fluxo existente".

## Migrations a criar

```text
supabase/migrations/
  20260630_010_extensions_and_helpers.sql      -- pgcrypto, set_updated_at()
  20260630_020_organizations_units.sql         -- organizations, units
  20260630_030_profiles_members.sql            -- profiles, organization_members, role enum-like check
  20260630_040_rls_helpers.sql                 -- is_member_of_organization, has_role, can_access_unit
  20260630_050_partners_products.sql           -- clients, suppliers, products
  20260630_060_negotiations.sql                -- negotiations
  20260630_070_simulations.sql                 -- simulations + items + purchase_components + expenses + payment_terms + installments
  20260630_080_approvals.sql                   -- simulation_approvals
  20260630_090_orders.sql                      -- orders, order_items, order_status_events
  20260630_100_documents_audit_notifications.sql
  20260630_110_financial_freight_delivery.sql  -- financial_titles, freights, deliveries
  20260630_120_document_sequences.sql          -- document_sequences + next_document_code()
  20260630_130_views.sql                       -- simulation_summary_view, order_summary_view
supabase/seed.sql                              -- org Master + 3 unidades + clientes/fornecedores/produtos fictícios
```

## Padrão de RLS por tabela

Para cada tabela com `organization_id`:

```sql
-- SELECT: membros da org
create policy "<table>_select" on public.<table>
  for select to authenticated
  using (public.is_member_of_organization(organization_id));

-- INSERT: membro da org com unidade acessível
create policy "<table>_insert" on public.<table>
  for insert to authenticated
  with check (
    public.is_member_of_organization(organization_id)
    and (unit_id is null or public.can_access_unit(unit_id))
  );

-- UPDATE: roles operacionais
create policy "<table>_update" on public.<table>
  for update to authenticated
  using (public.has_role(organization_id, array['admin','gestor','comercial','aprovador','financeiro','frota']))
  with check (public.is_member_of_organization(organization_id));

-- DELETE: só admin/gestor
create policy "<table>_delete" on public.<table>
  for delete to authenticated
  using (public.has_role(organization_id, array['admin','gestor']));
```

Tabelas filhas (`simulation_items`, `simulation_expenses`, `purchase_components`, `simulation_installments`, `simulation_payment_terms`, `order_items`, `order_status_events`) aplicam RLS via `exists (select 1 from parent where parent.id = child.parent_id and is_member_of_organization(parent.organization_id))`.

`profiles` policy especial: usuário sempre lê/edita próprio registro. `organization_members` lê membros das orgs onde também é membro.

## Grants

Toda tabela: `grant select, insert, update, delete on public.<t> to authenticated; grant all on public.<t> to service_role;`. Sem `anon` — sistema é interno.

## Funções RLS

```sql
create or replace function public.is_member_of_organization(_org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = _org_id and user_id = auth.uid()
  )
$$;

create or replace function public.has_role(_org_id uuid, _roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = _org_id and user_id = auth.uid() and role = any(_roles)
  )
$$;

create or replace function public.can_access_unit(_unit_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.units u
    join public.organization_members m on m.organization_id = u.organization_id
    where u.id = _unit_id
      and m.user_id = auth.uid()
      and (m.unit_id is null or m.unit_id = _unit_id or m.role in ('admin','gestor'))
  )
$$;
```

## Riscos / pendências (vou listar no fim)

- Seeds não criam usuários reais nem `organization_members` — após signup do primeiro usuário ele precisa ser inserido manualmente como `admin`.
- Storage bucket `master-flow-documents` e suas policies: vou apenas documentar (Storage policies via SQL puro são frágeis sem painel).
- `next_document_code()` vou criar como função simples mas concorrência ainda depende de `update ... returning` com locking — anotado.
- Frontend continua usando store local; troca para Supabase repositories fica para próxima onda.
- Cálculos fiscais permanecem em `src/lib/calculations.ts`.

## Tarefas finais

1. Rodar `bun run build` (typecheck implícito) para garantir que nada quebrou.
2. Resumir migrations, tabelas, views, funções, policies, seeds e próximos passos.
