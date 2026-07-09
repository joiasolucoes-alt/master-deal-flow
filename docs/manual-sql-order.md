# Ordem canônica de aplicação dos SQLs

Índice único da ordem em que os scripts devem ser executados num Supabase novo. Antes deste
documento, a ordem só era reconstituível cruzando `docs/manual-sql.md` com os cabeçalhos
"Dependências" de cada arquivo. **Nada é aplicado automaticamente** — rode manualmente no SQL
Editor, na ordem abaixo, e confirme cada passo.

## 1. Base (pasta `supabase/migrations/`)

Estas são as migrations "oficiais" (presumivelmente já aplicadas). Se estiver montando um
ambiente do zero, aplique-as primeiro:

| Ordem | Arquivo | O que faz |
| --- | --- | --- |
| 1 | `202606290001_initial_master_flow_schema.sql` | Schema inicial (organizations, units, profiles, clients, suppliers, products, negotiations, simulations + filhas, approvals, orders, audit_events, notifications). |
| 2 | `202607070001_negotiation_wallets.sql` | Carteiras de negociação + pools de oportunidade (com RLS por papel). Ver `docs/negotiation-wallets-flow.md`. |
| 3 | `202607070002_persist_negotiation_wallets.sql` | Persistência/ajustes das carteiras. |
| 4 | `202607070003_driver_portal.sql` | Portal do motorista (token + PIN). **Idêntico** a `manual-sql/018` — aplique só um dos dois. |

## 2. Scripts manuais (pasta `supabase/manual-sql/`)

Ordem numérica = ordem de aplicação. Cada wave depende das anteriores.

| Nº | Arquivo | O que faz |
| --- | --- | --- |
| 001 | `approval_workflow_hardening` | Reforço do fluxo de aprovação. |
| 002 | `catalog_crud_support` | Suporte a CRUD de clientes/fornecedores/produtos. |
| 003 | `basic_rls_for_homologation` | RLS **básica** (`true` p/ qualquer autenticado). ⚠️ Provisória — ver `docs/rls-refinement.md`. |
| 004 | `wave_2_financial_titles` | Tabela `financial_titles` (contas a pagar/receber). |
| 005 | `wave_2_freights` | Tabela `freights`. |
| 006 | `wave_2_deliveries` | Tabela `deliveries`. |
| 007 | `fix_freight_status_constraint` | Corrige a constraint de `status` de `freights` que uma migration anterior quebrou. ⚠️ Ver `docs/schema-consolidation.md` (Conflito 3). |
| 008 | `wave_1_two_step_approvals` | Aprovação em duas etapas (`stage` financeiro/principal). |
| 009 | `wave_2_delivery_proofs` | Canhoto/comprovante de entrega. |
| 010 | `wave_2_delivery_occurrences` | Histórico de ocorrências de entrega. |
| 011 | `wave_2_delivery_proof_uploads` | Upload real de comprovante (Storage). |
| 012 | `wave_1_3_realized_results` | Resultado realizado por pedido. |
| 013 | `wave_1_3_commission_approval` | Aprovação formal de comissão. |
| 014 | `self_signup_commercial_access` | Auto-cadastro como Comercial. |
| 015 | `wave_3_freight_documents` | Documentos anexos do frete (`freight_documents`). |
| 016 | `adjustment_fields_for_simulations` | Campos de ajuste em simulações. |
| 017 | `complete_billing_fields` | Campos completos de faturamento em `orders`. |
| 018 | `temporary_driver_portal` | Portal do motorista (token + PIN). **Idêntico** à migration `202607070003` — aplique só um. |
| 019 | `pre_order_payment_release` | Pagamento antecipado antes do pedido + comprovante em `financial_titles`. |
| 020 | `wave_4_freight_checklist` | Checklist documental do frete por tipo de carga. |
| 021 | `role_based_rls` *(proposto)* | Refinamento de RLS por papel + limpeza das policies abertas empilhadas. Fecha o buraco da RLS das carteiras. ⚠️ **Revisar antes de aplicar** — ver `docs/rls-refinement.md`. |
| 022 | `fix_freights_status_constraint` *(proposto)* | Remove a constraint dupla/enganosa de `freights.status`, deixando só a canônica (6 valores). ⚠️ Testar em preview. |
| 023 | `add_organization_id_to_core_tables` *(proposto)* | Adiciona `organization_id` + backfill em `simulations`/`orders`/`order_items`/`approvals`. ⚠️ Rodar `diagnostics/002` antes. |
| 024 | `role_based_rls_core_tables` *(proposto)* | RLS por organização nessas 4 tabelas, substituindo as policies provisórias do 021. ⚠️ **Só após 023 com 0 nulos.** |
| 025 | `role_based_rls_followup_tables` *(proposto)* | RLS nas tabelas restantes: filhas de simulação e realized_results (org via pai), negotiations (add org + backfill), units, profiles. ⚠️ Depende de 021 + 023. |

## 3. NÃO aplicar (histórico / trilha alternativa)

| Arquivo | Motivo |
| --- | --- |
| `supabase/sql/001_master_flow_multitenant.sql` | Trilha de schema alternativa não adotada pelo frontend. Conflita com as waves. Ver `docs/schema-consolidation.md` (Conflito 1). |
| `supabase/sql/002_master_flow_multitenant_seed.sql` | Seed da trilha alternativa. |
| `supabase/sql/driver_public_tracking.sql` | Desenho antigo do portal do motorista (só token), substituído por 018. Ver `docs/schema-consolidation.md` (Conflito 2). |

> Observação: os arquivos da seção 3 têm `create table if not exists` para as mesmas tabelas
> das waves. Aplicá-los **antes** das waves faz a wave correspondente ser ignorada
> silenciosamente. Por isso ficam fora da sequência canônica.
