# Onda 2 - Financeiro v1

## O que entrou

- Criação de títulos financeiros para representar contas a receber.
- Geração de parcelas a partir do prazo de pagamento do pedido.
- Tela Financeiro usando dados reais do app, não dados fixos na tela.
- Ação de baixa para marcar uma conta como recebida.
- Atualização do progresso de faturamento do pedido conforme as baixas.
- Persistência local preservada e persistência Supabase preparada.

## Como validar

1. Acesse `Financeiro`.
2. Clique em `Gerar contas dos pedidos`.
3. Confira se cada pedido visível gerou uma ou mais contas a receber.
4. Clique em `Dar baixa` em uma conta.
5. Confira se ela muda para `Pago`.
6. Abra o pedido relacionado e confira o avanço de faturamento.

## SQL necessário

Antes de usar com Supabase, rode:

`supabase/manual-sql/004_wave_2_financial_titles.sql`

## Ainda não incluso

- Contas a pagar.
- Conciliação bancária.
- Integração com banco ou ERP.
- Baixa parcial manual com valor digitado.
- Regras refinadas por perfil/unidade no banco.
