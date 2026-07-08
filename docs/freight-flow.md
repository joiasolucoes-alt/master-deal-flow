# Fluxo de Frete

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

