# Checklist da onda atual

1. Comercial cria proposta.
2. Comercial envia para aprovacao.
3. Gestor aprova.
4. Confirmar que nenhum pedido foi criado ainda.
5. Confirmar status **Aguardando pagamento**.
6. Financeiro ve contas a pagar da proposta.
7. Financeiro da baixa e informa comprovante.
8. Comercial ve a proposta em **Aguardando validacao comercial**.
9. Comercial valida o comprovante.
10. Sistema cria pedido confirmado.
11. Frete fica liberado.
12. Frete gera link real do motorista.
13. Motorista atualiza entrega.
14. Conferir registros no Supabase.

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

# Checklist - Jornada do Motorista (link + PIN)

Pré-requisito: rodar `supabase/manual-sql/027` e `028` no SQL Editor (nesta ordem).

1. Como Frete, gerar link + PIN de um frete liberado.
2. Abrir `/motorista/<token>` em aba anônima.
3. Informar PIN incorreto → mensagem amigável ("Senha incorreta...").
4. Informar PIN correto → entra na jornada.
5. Ver o resumo da operação (frete, motorista, placa, coleta, entrega).
6. Confirmar que NÃO aparecem margem/lucro/comissão/custos.
7. Marcar "Cheguei para carregar".
8. Marcar "Estou em trânsito".
9. Marcar "Cheguei no destino".
10. Registrar uma ocorrência (ex.: Cliente ausente) com descrição.
11. Marcar "Descarreguei" informando o nome do recebedor.
12. Tentar finalizar SEM anexar o canhoto → bloqueado.
13. Anexar foto do canhoto (JPG/PNG/PDF) → finaliza.
14. Como Frete, abrir o detalhe do frete → ver eventos + canhoto.
15. Como Financeiro/Comercial, abrir o Pedido → card "Entrega e comprovante" com o canhoto.
16. Confirmar pedido com status "Entregue" e progresso de entrega 100%.
17. Conferir `freight_events`, `delivery_proofs`, `notifications` (source=driver_link) e
    `audit_events` no Supabase.
18. Testar link expirado/revogado → acesso negado com mensagem clara.
