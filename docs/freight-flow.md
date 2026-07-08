# Onda atual - frete visivel, mas bloqueado

O Frete pode visualizar uma operacao futura apos a aprovacao do Gestor, mas nao pode executar antes de pagamento e validacao comercial.

Depois da validacao comercial, o pedido e confirmado e o frete fica liberado para contratar, anexar documentos e gerar link real do motorista.

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
