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
