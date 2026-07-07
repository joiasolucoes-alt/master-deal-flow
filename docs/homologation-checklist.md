# Checklist de homologação - Onda 1.1

## Login e ambiente

- Entrar no Master Flow.
- Confirmar se o usuário tem perfil correto.
- Em desenvolvimento, abrir Configurações > Diagnóstico.
- Conferir `Data provider`: `local` ou `supabase`.
- Conferir se Supabase URL e anon key aparecem como configuradas.
- Confirmar que não aparece erro de conexão.

## Cadastros

- Criar cliente.
- Editar cliente.
- Inativar e reativar cliente.
- Criar fornecedor.
- Editar fornecedor.
- Inativar e reativar fornecedor.
- Criar produto.
- Editar produto.
- Inativar e reativar produto.

## Simulação

- Criar nova simulação.
- Selecionar cliente cadastrado.
- Selecionar fornecedor cadastrado.
- Adicionar produto cadastrado.
- Preencher NF/Custos.
- Preencher despesas.
- Preencher pagamento.
- Salvar rascunho.
- Atualizar a página e confirmar persistência.
- Conferir cálculo de viabilidade.
- Enviar para aprovação.

## Supabase

- Conferir simulação em `simulations`.
- Conferir itens em `simulation_items`.
- Conferir custos/despesas em `simulation_costs`.
- Conferir NF/custos em `simulation_purchase_costs`.
- Conferir registro pendente em `approvals`.
- Conferir histórico em `audit_events`.
- Conferir notificação em `notifications`.

## Aprovação

- Entrar como usuário aprovador/admin.
- Abrir Central de Aprovações.
- Marcar checklist.
- Solicitar ajuste e conferir retorno ao comercial.
- Reenviar simulação ajustada.
- Aprovar simulação.
- Conferir registro aprovado em `approvals`.

## Pedido

- Converter simulação aprovada em pedido.
- Conferir pedido em `orders`.
- Conferir itens em `order_items`.
- Abrir Central de Pedidos.
- Abrir detalhe do pedido.
- Tentar converter a mesma simulação novamente e confirmar bloqueio.

## Permissões

- Comercial cria e edita apenas seu fluxo.
- Aprovador decide aprovações e não aprova simulação própria.
- Admin vê todos os fluxos e acessa Configurações.
- Usuário sem permissão não acessa ações restritas.

## Modo local

- Alterar `VITE_DATA_PROVIDER=local`.
- Confirmar que login local e fluxo principal continuam funcionando.
# Checklist - Onda Automacao Financeira e Frete

1. Criar uma simulacao com produtos, NF/custos, despesas e pagamento.
2. Enviar a simulacao para aprovacao.
3. Aprovar pelo Financeiro.
4. Aprovar pelo Gestor.
5. Confirmar que virou pedido.
6. Confirmar que o Financeiro recebeu contas a receber.
7. Confirmar que o Financeiro recebeu contas a pagar.
8. Confirmar que o Frete visualiza o pedido.
9. Confirmar que o Frete aparece como `Aguardando liberacao financeira`.
10. Tentar avancar o frete antes da baixa financeira e confirmar bloqueio.
11. Dar baixa em todas as contas a pagar do pedido.
12. Confirmar que o pedido muda para `Aguardando frete`.
13. Confirmar que o Frete muda para `Liberado para contratacao`.
14. Cadastrar transportadora, motorista, veiculo e documentos.
15. Gerar link do motorista.
16. Acessar o link do motorista.
17. Atualizar status pelo motorista.
18. Confirmar timeline no painel interno.
19. Conferir notificacoes internas.
20. Conferir dados no Supabase.
