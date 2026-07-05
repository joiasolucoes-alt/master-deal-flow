# Onda 3 - Financeiro v2

## O que entrou

- Baixa financeira com valor digitado pelo usuário.
- Suporte a baixa parcial em contas a receber e contas a pagar.
- Coluna de saldo em aberto por título.
- Status automático: a vencer, parcial, pago, vencido ou cancelado.
- Atualização proporcional do progresso de faturamento do pedido.
- Reflexo automático no resultado realizado, usando somente valores efetivamente baixados.

## Como validar

1. Acesse `Financeiro`.
2. Gere contas a receber ou contas a pagar, se ainda não existirem.
3. Clique em `Dar baixa`.
4. Informe um valor menor que o saldo do título.
5. Confira se o título muda para `Parcial` e se o saldo diminui.
6. Abra `Pedidos` e confira se o progresso de faturamento mudou proporcionalmente.
7. Volte ao `Financeiro`, dê baixa no saldo restante e confira se o título muda para `Pago`.
8. Abra `Relatórios` e confira o reflexo no resultado realizado.

## Observações

- A baixa não aceita valor maior que o saldo em aberto.
- A baixa total continua possível: basta informar o saldo inteiro.
- Não houve necessidade de SQL novo nesta etapa, pois os campos `paid_amount`, `status` e `paid_at` já existem.

