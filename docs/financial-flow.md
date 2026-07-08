# Onda atual - pagamento antes do pedido

O Financeiro passa a atuar depois da aprovacao do Gestor e antes da criacao do pedido. As contas a pagar da proposta sao geradas no status **Aguardando pagamento**. O comprovante e obrigatorio para a proposta seguir para validacao comercial.

Contas a receber continuam nascendo quando o pedido for confirmado.

# Fluxo Financeiro

## O que foi automatizado

Ao aprovar uma simulacao no Gestor, o sistema cria automaticamente:

- contas a receber com base na condicao de pagamento do pedido;
- contas a pagar de mercadoria/NF com base na composicao de compra;
- contas a pagar das despesas previstas da simulacao, como frete, comissao, custo NF, STRINT, PIS/COFINS, financeiro e outros.

## Baixa financeira

O Financeiro pode dar baixa total ou parcial nos titulos.

Regra de liberacao do frete:

- se existir conta a pagar do pedido em aberto, o frete fica bloqueado;
- quando todas as contas a pagar do pedido forem pagas, o pedido e liberado para o frete;
- contas a receber continuam sendo acompanhadas, mas nao bloqueiam a contratacao do frete nesta onda.

## Fora desta rodada

- emissao oficial de NF/SEFAZ;
- integracao bancaria real;
- anexos de comprovantes financeiros;
- boletos reais.
