# Onda atual - pagamento antes do pedido

O Financeiro passa a atuar depois da aprovacao do Gestor e antes da criacao do pedido. As contas a pagar da proposta sao geradas no status **Aguardando pagamento**. O comprovante e obrigatorio para a proposta seguir para validacao comercial.

Contas a receber continuam nascendo quando o pedido for confirmado.

## Faturamento é frente PARALELA (fix: separate freight release from financial invoicing)

Após a validação comercial, o pedido nasce **Pedido confirmado** e o **frete já fica liberado**. O faturamento passa a ser uma pendência **paralela** do Financeiro/Faturamento (status derivado **"Aguardando faturamento"**), que **não bloqueia** o frete:

- O Financeiro registra NF (número, valor, emissão, vencimento, observação) e contas a receber a qualquer momento.
- Registrar o faturamento **não altera** o status operacional do pedido nem trava a contratação do frete.
- O Financeiro **não contrata frete** e **não gera link/PIN** do motorista (só Frete/Admin — permissão `freights:operate`).
- Aba **Pagamento de Negociação**: o botão passou a ser **"Fazer pagamento"** e abre um modal com **todos os lançamentos a pagar** da simulação (tipo, descrição, documento, previsto, pago, saldo, vencimento, status, comprovante), pagando cada item individualmente — não abre mais um lançamento aleatório.

**Preparação de frete em paralelo:** a partir da aprovação do Gestor, além das contas a pagar da proposta, a operação também fica visível para o Frete como **preparação** (sem virar pedido). O Financeiro é notificado para pagar; o Frete é notificado para preparar. A liberação do frete para execução continua condicionada ao pagamento, à validação comercial e ao faturamento/NF. Ver `docs/operational-flow.md`.

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
