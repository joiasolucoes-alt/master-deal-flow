# Onda atual - frete visivel, mas bloqueado

O Frete pode visualizar uma operacao futura apos a aprovacao do Gestor, mas nao pode executar antes de pagamento e validacao comercial.

Depois da validacao comercial, o pedido e confirmado e o frete fica liberado para contratar, anexar documentos e gerar link real do motorista.

# Fluxo de Frete

## Baldes da tela de Fretes (preparação vs execução)

A tela de Fretes separa as operações em quatro abas/filtros, para não confundir o que já pode ser executado com o que é apenas preparação:

| Balde | O que é | Pode executar? |
| --- | --- | --- |
| **Preparação** | Frete sem pedido vinculado (SIM aprovada pelo Gestor, aguardando pagamento) **ou** pedido criado aguardando faturamento/NF. | ❌ Bloqueado |
| **Liberados** | Pedido financeiramente liberado (faturado), frete pronto para contratar/gerar link. | ✅ |
| **Em andamento** | Frete em carregamento ou em rota. | ✅ |
| **Finalizados** | Entregue ou cancelado. | — |

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
