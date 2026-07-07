# Fluxo Operacional

## Onda - Automacao Financeira e Liberacao do Frete

Fluxo validado para esta onda:

1. Comercial cria a simulacao.
2. Financeiro revisa a primeira etapa de aprovacao.
3. Gestor faz a aprovacao final.
4. A simulacao aprovada vira pedido.
5. O sistema gera contas a receber e contas a pagar previstas.
6. O Financeiro recebe a operacao para baixa dos pagamentos necessarios.
7. O Frete ja visualiza o pedido, mas bloqueado como `Aguardando liberacao financeira`.
8. Quando as contas a pagar do pedido sao baixadas, o pedido muda para `Aguardando frete`.
9. O Frete pode cadastrar transportadora, motorista, veiculo, documentos e gerar o link do motorista.
10. O motorista atualiza a entrega pelo portal temporario.

O Supabase segue como fonte principal em producao. O LocalStorage fica como fallback de desenvolvimento.

