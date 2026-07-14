# SQL manual desta onda

Rodar manualmente no Supabase SQL Editor:

1. `supabase/manual-sql/019_pre_order_payment_release.sql`

Esse SQL adiciona campos de pagamento/comprovante em `simulations`, campos de vinculo de proposta/comprovante em `financial_titles` e amplia os status aceitos para simulacoes e pedidos.

# SQL Manual

## Onda - Automacao Financeira e Liberacao do Frete

Nenhum SQL novo obrigatorio foi criado nesta rodada.

Motivo: o fluxo foi implementado reutilizando estruturas ja existentes:

- `orders`
- `financial_titles`
- `freights`
- `freight_documents`
- `driver_access_links`
- `freight_events`
- `delivery_proofs`
- `notifications`
- `audit_events`

## SQLs que precisam existir no Supabase

Antes de testar esta onda em producao, confirme que os SQLs anteriores ja foram aplicados:

1. `supabase/manual-sql/004_wave_2_financial_titles.sql`
2. `supabase/manual-sql/005_wave_2_freights.sql`
3. `supabase/manual-sql/015_wave_3_freight_documents.sql`
4. `supabase/manual-sql/017_complete_billing_fields.sql`
5. `supabase/manual-sql/018_temporary_driver_portal.sql`

## Como validar

Crie uma simulacao, aprove no Financeiro e no Gestor, confirme se o pedido gerou contas no Financeiro e se o frete aparece bloqueado ate a baixa das contas a pagar.

## fix: repair driver checklist and occurrence rpc errors — REQUER SQL 030

O checklist ("Cheguei para carregar") e a ocorrência do motorista falhavam com HTTP 400 / `42703: column "organization_id" of relation "freight_events" does not exist`.

**Causa:** `public.freight_events` e `public.delivery_proofs` (tabelas do desenho antigo do portal) não têm as colunas `organization_id`/`order_id` que as RPCs (`driver_trip_event`, `driver_trip_occurrence`, `driver_proof_record`) inserem. As defs novas usam `create table if not exists`, que foi no-op nessas tabelas pré-existentes. `driver_access_links` (criada nova) já tem as colunas — por isso só a geração do link funcionava.

**Correção — rodar `supabase/manual-sql/030_fix_driver_event_columns.sql`:** adiciona `organization_id`/`order_id` (uuid, nullable) nas duas tabelas. Aditivo, 0 linhas em produção, sem backfill, sem mudar as RPCs. Baixo risco, pode rodar em produção.

## fix: move freight operation tracking to driver checklist — SEM mudança de schema

**Nenhum SQL.** Tudo é regra/UI no frontend, reutilizando as tabelas existentes (`freights`, `driver_access_links`, `driver_tracking_events`/`freight_events`, `delivery_proofs`, `notifications`, `audit_events`):

- Frete só contrata; avanço operacional passa para o checklist do motorista (dados já existentes).
- Comercial ganhou `freights:view` (permissão só no frontend).
- Remoção da captura de geolocalização (só cliente; colunas de lat/long, se existirem, ficam apenas nulas).

## fix: separate freight release from financial invoicing — SEM mudança de schema

Esta entrega **não requer nenhum SQL**. Toda a mudança é de regra de negócio/UI no frontend:

- liberação do frete desacoplada do faturamento (derivada do status do pedido);
- status separados por área (derivados de `orders.status`/`billingProgress`);
- permissão `freights:operate` (apenas no frontend);
- correção do bug de SIM fantasma (estado inicial vazio no modo Supabase — não toca no banco);
- auto-refresh por polling (frontend).

Nenhuma tabela/coluna/constraint/RLS/trigger foi alterada.

## feat: expose approved simulations to freight preparation — SEM mudança de schema

A regra "SIM aprovada pelo Gestor fica visível para o Frete como preparação" **não requer nenhuma alteração de banco**:

- O frete de preparação é gravado em `public.freights` com `order_id NULL` — coluna já nullable (`005_wave_2_freights.sql`).
- Notificações por papel (Financeiro/Frete/Comercial) e auditoria acontecem na aplicação (store/localStorage como fallback) e nas funções/gatilhos já existentes; nada novo é necessário.
- Único arquivo entregue: `supabase/manual-sql/029_verify_freight_preparation.sql` — **somente leitura** (SELECTs de verificação). Pode rodar em produção sem risco.

**Ordem de execução manual:** nenhuma DDL nova. Opcionalmente rode `029` para conferir.
