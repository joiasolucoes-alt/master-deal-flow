# Checklist — Operação do frete via checklist do motorista (fix: move freight operation tracking to driver checklist)

1. Como **Frete**, abrir um frete **Liberado**: o único botão de avanço é **"Contratar frete"**.
2. Contratar → status vira **"Frete contratado"** e aparece o aviso "operação com o motorista".
3. Confirmar que **não** há mais botões "Iniciar carregamento / Em rota / Finalizar entrega" no perfil Frete.
4. Confirmar que o **link/PIN** do motorista fica disponível para gerar após contratar.
5. Abrir o **link do motorista** + PIN: ver identificação, origem, destino, carga, checklist, observação e upload do canhoto — **sem** pedir localização.
6. Preencher o checklist; tentar **finalizar sem canhoto** → deve ser **bloqueado**.
7. Anexar foto do canhoto (JPG/PNG) e finalizar → entrega vira **Entregue/Finalizado**.
8. Como **Frete**: acompanhar a **timeline** do motorista e ver o **canhoto** (aba Rastreamento).
9. Como **Financeiro** e como **Comercial**: abrir a aba **Fretes** → é **somente acompanhamento** (timeline + canhoto), **sem** botões de contratar/gerar link/avançar.
10. Confirmar que Financeiro e Comercial **não** conseguem contratar frete.
11. Conferir que os botões **"Salvar dados"** ficam no **final** de cada bloco (Motorista, Veículo, Pagamento).
12. Deixar duas telas abertas e confirmar **atualização sem F5** (~12s) na timeline/fretes.

# Checklist — Frete e faturamento em paralelo (fix: separate freight release from financial invoicing)

1. Criar SIM (Comercial) → enviar para o Gestor.
2. Aprovar (Gestor) → confirmar que aparece p/ Financeiro (pagar) e p/ Frete (preparação).
3. Financeiro paga e anexa comprovante.
4. Comercial valida o comprovante.
5. Confirmar que a SIM virou **Pedido** e **nenhuma SIM duplicada** apareceu.
6. Em **Pedidos**: badges = **Pedido confirmado** / Frete: **Liberado para contratação** / Faturamento: **Aguardando faturamento**.
7. Como **Frete**: o pedido está em **Liberados**; contratar o frete **sem** faturar antes → status vira **"Frete contratado"**.
8. Confirmar que o Frete consegue **gerar link/PIN** do motorista após contratar.
9. Como **Financeiro**: registrar faturamento/NF em paralelo → o frete **continua** liberado (não trava).
10. Confirmar que **Financeiro não contrata frete** nem gera link/PIN (botões bloqueados/ação negada).
11. Confirmar que **Frete e Comercial não faturam** (sem acesso à ação de faturamento).
12. Ver resumo da carga no Frete: produto, descrição, **QTD.(CX)**, cliente, origem/destino, previsões.
13. Aba **Financeiro > Pagamento de Negociação**: botão **"Fazer pagamento"** abre modal com **todos** os lançamentos a pagar; pagar um item específico.
14. Deixar duas telas abertas (ex.: Aprovações e Fretes) e confirmar que **atualizam sem F5** (~12s).
15. Conferir notificações (aprovação, pagamento, validação, contratação) e o histórico/auditoria.
16. Conferir dados no Supabase.

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

## Checklist — Preparação de frete (SIM aprovada visível para o Frete)

1. Criar uma nova simulação (Comercial).
2. Enviar para aprovação do Gestor.
3. Acessar como Gestor e aprovar.
4. Confirmar que a simulação foi para o Financeiro (status **Aguardando pagamento**) e que **nenhum pedido** foi criado.
5. Acessar **Fretes** como Frete/Financeiro/Admin e confirmar a operação na aba **Preparação**, com rótulo "Ainda não virou pedido • bloqueada para execução".
6. Confirmar que o Frete consegue **visualizar** cliente, carga, quantidade, origem, destino, previsões e valor previsto.
7. Confirmar que o Frete **não consegue gerar link/PIN** do motorista (aba Rastreamento com o botão desabilitado e aviso).
8. Confirmar que o Frete **não consegue avançar** a operação (botão de avançar desabilitado).
9. Registrar uma observação interna de preparação (salvar dados do frete) e confirmar que persiste.
10. Conferir as notificações da aprovação: **Financeiro**, **Frete** e **Comercial**.
11. Acessar como Financeiro e registrar pagamento + comprovante.
12. Acessar como Comercial e validar o comprovante.
13. Confirmar que a SIM virou **Pedido** e que o mesmo frete migrou de **Preparação** para o pedido (sem duplicar).
14. Registrar o faturamento/NF e confirmar que o frete migra para **Liberados** e as ações são habilitadas.
15. Conferir histórico/auditoria (`audit_events`) e as notificações de liberação para o Frete.
16. Rodar `supabase/manual-sql/029_verify_freight_preparation.sql` (somente leitura) e conferir os fretes de preparação.

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
