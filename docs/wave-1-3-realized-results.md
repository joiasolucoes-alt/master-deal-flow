# Onda 1.3 - Resultado realizado

## Objetivo

Mostrar o resultado real da operação depois que o pedido começa a movimentar financeiro, frete e entrega.

## O que entrou

- Seção "Resultado realizado" na aba Relatórios.
- Receita recebida a partir das contas a receber.
- Custos pagos a partir das contas a pagar.
- Comissão estimada pela regra da simulação; quando não houver regra, usa 2,5%.
- Lucro realizado: receita recebida menos custos pagos e comissão estimada.
- Margem realizada e comparação com a margem prevista da simulação.
- Status de fechamento por pedido: em andamento, em fechamento ou concluído.

## SQL

Execute no Supabase:

`supabase/manual-sql/012_wave_1_3_realized_results.sql`

Esse SQL prepara a tabela `realized_results` para armazenamento futuro dos fechamentos.

## Como validar

1. Abra Relatórios.
2. Confira os cards de receita recebida, lucro realizado, margem realizada e saldo a receber.
3. Na tabela "Resultado realizado por pedido", compare margem real com margem prevista.
4. Dê baixa em contas a receber e contas a pagar no Financeiro.
5. Volte em Relatórios e veja se lucro e margem realizada mudam.

## Ainda não incluso

- Aprovação formal de comissão.
- Fechamento contábil definitivo.
- Conciliação bancária.
- Travamento de resultado fechado.
- Gravação automática do resultado calculado na tabela `realized_results`.
