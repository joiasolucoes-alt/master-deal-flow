# Fluxo de comissao

## Situacao atual

A simulacao calcula a comissao prevista como parte das despesas. O fechamento realizado ja possui estrutura para aprovacao de comissao, mas ainda precisa amadurecer como processo completo.

## Nova regra

O Comercial precisa acompanhar:

1. Comissao prevista na proposta.
2. Pedido confirmado.
3. Entrega realizada.
4. Recebimentos do cliente.
5. Resultado final da operacao.
6. Comissao realizada e status de fechamento.

## Nesta onda

- A comissão aparece em uma fila própria em `Relatórios`.
- O pagamento fica bloqueado até o resultado estar fechado e a comissão aprovada.
- Admin e Financeiro podem aprovar e marcar a comissão como paga.
- Resultado fechado pode ser reaberto com motivo, desde que a comissão ainda não tenha sido paga.
- A reabertura bloqueia novamente o pagamento da comissão até novo fechamento/aprovação.

## Proximas melhorias

- Exibir previsto x realizado por vendedor.
- Exportar relatorio de comissao.
