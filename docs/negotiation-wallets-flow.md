# Fluxo — Carteiras de Negociação e Pool de Oportunidades

> Documenta uma funcionalidade que existia no banco (migrations `202607070001_negotiation_wallets.sql`
> e `202607070002_persist_negotiation_wallets.sql`) e no frontend, mas que não tinha nenhum
> documento de processo em `docs/`. Este arquivo cobre essa lacuna.

## O que é

A **carteira de negociação** (`negotiation_wallet`) é o registro gerencial que acompanha,
por pedido/negociação, a diferença entre o **lucro previsto** na proposta aprovada e o
**resultado que foi de fato se realizando** ao longo da operação (economia ou estouro de
frete, ajustes de comissão, descontos concedidos no faturamento, etc.).

Cada lançamento é um **crédito** (entrou mais lucro que o previsto) ou **débito** (o lucro
previsto foi corroído). O saldo corrente da carteira é a soma desses lançamentos sobre o
lucro inicial esperado.

O **pool de oportunidades** (`opportunity_pool`) é um agregador: carteiras encerradas podem
**transferir** seu saldo final para um pool comum, consolidando a "sobra" de várias
negociações num só lugar para acompanhamento e uso posterior.

## Modelo de dados

| Tabela                       | Papel                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `negotiation_wallets`        | Cabeçalho da carteira: `initial_expected_profit`, `current_balance`, `final_balance`, `status` (`open` / `locked` / `closed` / `transferred` / `cancelled`), vínculo com `simulation_id` / `order_id`. Há `unique (organization_id, order_id)` — uma carteira por pedido. |
| `negotiation_wallet_entries` | Lançamentos: `direction` (`credit` / `debit`), `amount` (> 0), `category`, `source_module`, `description`, `reference_id` (idempotência por origem), `entry_type` (`automatic` / manual). Suporta estorno via `reversed_at` / `reversed_by` / `reversal_reason`.          |
| `opportunity_pools`          | Pool agregador: `name`, `balance`, `status` (`active` / `archived`).                                                                                                                                                                                                      |
| `opportunity_pool_entries`   | Lançamentos do pool, opcionalmente ligados à `wallet_id` de origem.                                                                                                                                                                                                       |

Após a SQL 036, a RLS separa consulta e gestão. Admin, Gestor e Financeiro consultam os
valores gerenciais; somente o Admin encerra/transfere carteiras e movimenta o pool. Frete
mantém apenas o acesso técnico necessário aos lançamentos automáticos de frete. Comercial
abre a carteira por uma função segura, mas não recebe os saldos na interface nem por leitura
direta das tabelas.

## Fluxo ponta a ponta

1. **Abertura** — quando uma simulação aprovada e paga é convertida em pedido
   (`convertSimulationToOrder`), o frontend chama `createWalletFromSimulationOrder`, que abre
   uma carteira `open` com `initial_expected_profit` = lucro líquido previsto na proposta.
2. **Lançamentos automáticos durante a operação:**
   - **Frete** (`createFreightWalletEntry`, tela de Fretes): compara o frete previsto na
     proposta com o valor efetivamente contratado — gera crédito (economia) ou débito
     (estouro).
   - **Faturamento/desconto** (tela de Financeiro / Pedido): descontos concedidos no
     faturamento entram como débito.
3. **Ajustes manuais** — somente o Admin pode adicionar, estornar ou justificar lançamentos
   manuais pela interface. Financeiro e Frete continuam gerando lançamentos automáticos dos
   seus próprios módulos.
4. **Conferência do resultado** — depois que o Resultado Realizado do pedido é fechado, a
   carteira compara seu saldo com o lucro efetivamente apurado. Se houver diferença, o Admin
   registra uma conciliação automática no extrato, sem apagar os lançamentos anteriores.
5. **Encerramento** — somente o Admin fecha a carteira (`closed`), congelando o
   `final_balance`. O botão permanece bloqueado enquanto o Resultado Realizado não estiver
   fechado ou enquanto existir diferença sem conciliação.
6. **Decisão gerencial** — somente o Admin registra o destino do saldo final. Saldo positivo
   pode ser aprovado para o Pool ou mantido na carteira; prejuízo exige motivo e indicação de
   quem o absorve; saldo zero também recebe confirmação formal.
7. **Transferência para o pool** — somente carteira encerrada, positiva e aprovada para o
   Pool pode ser transferida (`transferred`). A SQL 037 executa Carteira e Pool na mesma
   transação e usa uma identificação única para impedir crédito duplicado.
8. **Cobertura de prejuízo** — quando o resultado final é negativo, o Admin registra quem
   absorve o prejuízo. Se a responsabilidade for da Master, a SQL 038 permite usar o saldo
   acumulado do Pool para uma compensação parcial ou total. O lucro realizado continua
   negativo no histórico; a cobertura informa de onde veio o recurso para absorvê-lo.
9. **Controle e auditoria** — a página do Pool consolida entradas, saídas, pedido vinculado,
   responsável e data. O relatório pode ser filtrado por pedido, período ou responsável e
   exportado em CSV para conferência. Transferências e coberturas notificam Admin, Gestor e
   Financeiro sem misturar os destinatários.

## Onde vive no código

- Domínio: `src/features/negotiation-wallets.ts` (tipos, `getWalletTotals`,
  `recalculateWallet`, `createWalletFromSimulationOrder`, `createWalletEntry`,
  `upsertWalletEntry`, `createFreightWalletEntry`, `getWalletReconciliation`,
  `reconcileWalletWithRealizedResult`, `recordWalletManagementDecision`,
  `prepareWalletTransferToPool`, `reverseEntriesByReference`).
- UI: `src/features/negotiation-wallets-ui.tsx` (`NegotiationWalletSection`,
  `OpportunityPoolSection`), reutilizada em Simulações, Fretes, Financeiro e Pedidos.
- Persistência: `src/features/negotiation-wallets/repositories/supabaseNegotiationWalletRepository.ts`.
- Rota do pool consolidado: `/pool-oportunidades`
  (`src/routes/_app.pool-oportunidades.tsx`).

## Matriz de acesso

| Perfil             | Carteira           | Pool     | Movimentação                                        |
| ------------------ | ------------------ | -------- | --------------------------------------------------- |
| Admin              | Consulta           | Consulta | Total                                               |
| Gestor             | Consulta           | Consulta | Não                                                 |
| Financeiro         | Consulta           | Consulta | Apenas lançamentos automáticos do módulo financeiro |
| Frete              | Sem tela gerencial | Sem tela | Apenas lançamentos automáticos de frete             |
| Comercial e demais | Não                | Não      | Não                                                 |

## Conferência esperada

No detalhe do pedido, o bloco **Conferência do resultado** apresenta lado a lado o lucro
previsto, o saldo formado pelo extrato da carteira e o lucro realizado congelado. Após a
conciliação, o saldo da carteira deve ser igual ao `realized_profit` do resultado fechado.

Na rota `/pool-oportunidades`, Admin, Gestor e Financeiro enxergam as carteiras encerradas,
o resultado positivo/negativo e a decisão registrada. Apenas o Admin abre a carteira para
decidir o destino, efetivar uma transferência ou cobrir um prejuízo assumido pela Master.
O histórico de movimentações funciona como extrato gerencial e preserva o valor, o pedido e
o responsável por cada entrada ou saída.
