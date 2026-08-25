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
4. **Encerramento** — somente o Admin fecha a carteira (`closed`), congelando o
   `final_balance`.
5. **Transferência para o pool** — somente carteira encerrada com saldo final positivo pode
   ser transferida (`transferred`), e somente o Admin realiza a ação.

## Onde vive no código

- Domínio: `src/features/negotiation-wallets.ts` (tipos, `getWalletTotals`,
  `recalculateWallet`, `createWalletFromSimulationOrder`, `createWalletEntry`,
  `upsertWalletEntry`, `createFreightWalletEntry`, `reverseEntriesByReference`).
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

## Pendências conhecidas

- Não há relatório de reconciliação entre o `final_balance` das carteiras e os
  `realized_results` por pedido — os dois números vêm de origens diferentes e podem divergir.
