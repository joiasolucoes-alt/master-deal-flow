# Onda atual - frete visivel, mas bloqueado

O Frete pode visualizar uma operacao futura apos a aprovacao do Gestor, mas nao pode executar antes de pagamento e validacao comercial.

Depois da validacao comercial, o pedido e confirmado e o frete fica liberado para contratar, anexar documentos e gerar link real do motorista.

# Fluxo de Frete

## Frete contrata; o motorista executa o avanço (fix: move freight operation tracking to driver checklist)

Após a validação comercial, o frete fica **Liberado para contratação**. O papel do **Frete/Admin** é:

1. **Contratar** o frete (quoted → hired). O botão de avanço só oferece **"Contratar frete"** — não existem mais botões de "Iniciar carregamento / Em rota / Finalizar entrega" no perfil Frete.
2. Depois de contratado, **gerar o link/PIN** do motorista e **acompanhar** a timeline/checklist e o canhoto.

O **avanço operacional** (carregamento, viagem, descarga, entrega) é feito **pelo motorista**, no link externo — não pelo Frete. Após contratar, a tela do Frete mostra um aviso "Frete contratado — operação com o motorista".

**Comercial e Financeiro:** a aba Fretes é **somente acompanhamento** — veem a lista, o status, o motorista/veículo, origem/destino, a **timeline/checklist** do motorista e o **canhoto**. Não contratam, não geram link/PIN e não avançam operação (sem `freights:operate`). O Comercial ganhou `freights:view` para acompanhar.

**Botões de salvar:** padronizados no **final** de cada bloco (Resumo, Motorista, Veículo, Pagamento).

## Liberação do frete NÃO depende do faturamento (fix: separate freight release from financial invoicing)

Assim que o Comercial valida o comprovante e a SIM vira **Pedido confirmado**, o frete fica **liberado para contratação** — não espera o faturamento/NF. `isOrderFinanciallyReleased` trata "Pedido confirmado" como liberado.

- O Frete vê o pedido como: **Frete liberado**, pronto para contratação, pedido confirmado, pagamento validado, e "Faturamento: aguardando" **apenas como informação**.
- Contratar (quoted → hired) marca **"Frete contratado"**, registra histórico e notifica Comercial e Financeiro.
- Após contratar, gera-se o **link/PIN** do motorista; os status operacionais seguintes vêm do **checklist externo do motorista**.
- Apenas **Frete/Logística e Admin** operam o frete (permissão `freights:operate`). **Financeiro** tem só visualização — não contrata nem gera link/PIN. Frete/Comercial **não faturam**.
- Resumo da carga (produto, descrição, **QTD.(CX)**, qtd. total, cliente, fornecedor, origem/destino, previsões) aparece na aba **Resumo** do frete, tanto na preparação quanto no pedido.

## Baldes da tela de Fretes (preparação vs execução)

A tela de Fretes separa as operações em quatro abas/filtros, para não confundir o que já pode ser executado com o que é apenas preparação:

| Balde            | O que é                                                                                                                     | Pode executar? |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Preparação**   | Frete sem pedido vinculado (SIM aprovada pelo Gestor, aguardando pagamento) **ou** pedido criado aguardando faturamento/NF. | ❌ Bloqueado   |
| **Liberados**    | Pedido financeiramente liberado (faturado), frete pronto para contratar/gerar link.                                         | ✅             |
| **Em andamento** | Frete em carregamento ou em rota.                                                                                           | ✅             |
| **Finalizados**  | Entregue ou cancelado.                                                                                                      | —              |

Classificação implementada em `src/features/freights/freightPreparation.ts` (`getFreightBucket`). A visibilidade por perfil está em `src/lib/visibility.ts` (`filterFreightsForUser`): Admin, Financeiro, Aprovador e Frete enxergam **todos** os fretes, inclusive os de preparação.

### O que o Frete PODE na preparação

Visualizar cliente/carga/quantidade/origem/destino/previsões/valor previsto; preparar dados de transportadora e veículo; registrar observações internas.

### O que o Frete NÃO PODE na preparação

Contratar oficialmente; gerar link/PIN do motorista; carregar; marcar carregado/em rota; finalizar entrega; anexar canhoto final; alterar status operacional definitivo. Gates em `canExecuteFreight` / `canGenerateDriverLink` e reforçados pelos handlers da tela.

## Visibilidade

O frete visualiza o pedido assim que ele nasce, mesmo antes da liberacao financeira.

## Bloqueio operacional

Enquanto o Financeiro nao baixar as contas a pagar necessarias, o frete mostra:

`Aguardando liberacao financeira`

Nesse estado, o frete pode ser preparado, mas nao deve:

- avancar status operacional;
- acionar o motorista;
- gerar link temporario para motorista.

## Liberacao

Quando o Financeiro baixa as contas a pagar, o pedido muda para `Aguardando frete` e o frete passa para:

`Liberado para contratacao`

Depois disso, o usuario pode cadastrar transportadora, motorista, veiculo, documentos e gerar o link temporario do motorista.
