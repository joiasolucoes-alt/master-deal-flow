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
