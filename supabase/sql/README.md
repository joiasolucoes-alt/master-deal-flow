# Master Flow — Onda 1 multiempresa/multiunidade

Este diretório contém os scripts SQL preparados nesta rodada. A ferramenta
oficial de migration **não foi exposta** nesta sessão do agente, por isso
os arquivos foram colocados em `supabase/sql/` em vez de
`supabase/migrations/`. Para aplicar:

1. Abra o painel do Supabase → SQL Editor.
2. Execute, **na ordem**:
   - `001_master_flow_multitenant.sql` — schema, RLS e funções.
   - `002_master_flow_multitenant_seed.sql` — organização, unidades, clientes, fornecedores e produtos fictícios.
3. Faça login com seu usuário no app e, no SQL Editor, vincule-se à organização:

```sql
insert into public.organization_members (organization_id, unit_id, user_id, role)
values ('00000000-0000-0000-0000-00000000m4st'::uuid,
        '00000000-0000-0000-0000-000000000u01'::uuid,
        auth.uid(), 'admin');
```

A migration é **aditiva** (não usa `DROP TABLE`). Ela:
- adiciona `organization_id` nas tabelas existentes;
- substitui as policies abertas (`true`) por policies por papel/unidade;
- mantém as tabelas antigas (`approvals`, `simulation_costs`, `simulation_purchase_costs`)
  convivendo com as novas (`simulation_approvals`, `simulation_expenses`,
  `purchase_components`) para não quebrar nada.

## Tabelas

**Novas:** `organizations`, `organization_members`, `purchase_components`,
`simulation_expenses`, `simulation_payment_terms`, `simulation_approvals`,
`order_status_events`, `documents`, `financial_titles`, `freights`,
`deliveries`, `document_sequences`.

**Estendidas:** `units`, `profiles`, `clients`, `suppliers`, `products`,
`negotiations`, `simulations`, `orders`, `audit_events`, `notifications`.

## Views

`simulation_summary_view`, `order_summary_view` — respeitam RLS via tabelas
base.

## Funções

`set_updated_at()`, `is_member_of_organization()`, `has_role()`,
`can_access_unit()`, `current_user_organizations()`,
`next_document_code(unit_id, type)`.

## Storage

Bucket `master-flow-documents` é criado (privado). Policies de Storage
ficaram pendentes para a próxima rodada (configurar via painel).

## Frontend

O frontend continua operando em modo local (provider em `src/data` /
`src/store`). Os repositórios Supabase ainda não foram trocados nas telas,
intencionalmente, para preservar o fluxo atual. Próximos passos sugeridos:

- Criar `src/lib/supabaseClient.ts` usando `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_PUBLISHABLE_KEY` da Lovable Cloud.
- Adicionar `src/repositories/supabase/*Repository.ts` espelhando os
  contratos da store local.
- Trocar provider tela a tela (Simulações → Aprovações → Pedidos) com
  feature flag.

## Riscos e pendências

- A função `next_document_code` é `security definer`; revise antes de uso
  em produção.
- Policies de Storage **não** foram criadas — qualquer upload falhará até
  configurar.
- Membros precisam ser cadastrados manualmente em `organization_members`
  na primeira execução; sem isso, RLS bloqueia tudo no Supabase (é o
  comportamento desejado).
- As tabelas antigas `approvals`, `simulation_costs`,
  `simulation_purchase_costs` permanecem por compatibilidade; planejar
  migração de dados e DROP em rodada futura.
- Constraints de `status`/`stage` nas tabelas pré-existentes (`negotiations`,
  `simulations`, `orders`) **não** foram alteradas para evitar quebrar
  registros existentes; padronizar valores antes de adicionar CHECK.
