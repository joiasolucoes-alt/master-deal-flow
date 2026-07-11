# Onda atual - fluxo operacional aprovado pelo cliente

O pedido operacional so nasce depois da validacao comercial do comprovante de pagamento. A aprovacao do Gestor muda a proposta para **Aguardando pagamento**, sem criar pedido.

Fluxo oficial: Comercial cria proposta -> Gestor aprova -> Financeiro registra pagamento e comprovante -> Comercial valida -> Pedido confirmado -> Frete liberado -> Motorista atualiza entrega -> Financeiro e Comercial acompanham fechamento.

## Preparação logística antecipada (feat: expose approved simulations to freight preparation)

A partir da aprovação do Gestor, a operação já fica **visível para o Frete/Logística como preparação**, em paralelo ao pagamento do Financeiro — mas **a simulação ainda NÃO virou pedido** e a execução continua bloqueada.

- Ao Gestor aprovar (status **Aguardando pagamento**), o sistema gera um registro de frete de **preparação** (sem `orderId`) e notifica **Financeiro**, **Frete** e **Comercial**.
- O Frete enxerga cliente, carga, quantidade, origem, destino, previsões e valor previsto de frete, e pode **preparar dados e registrar observações internas**.
- O Frete **não pode** contratar oficialmente, gerar link/PIN do motorista, carregar, rodar, finalizar entrega ou anexar canhoto antes da liberação.
- Quando o Comercial valida o comprovante e a SIM vira **Pedido**, o mesmo frete de preparação é **vinculado ao pedido** (não duplica). A execução é liberada após o **faturamento/NF** (regra vigente da onda anterior).

Sequência: Gestor aprova → Financeiro recebe para pagamento **e** Frete recebe para preparação → Financeiro paga → Comercial valida → SIM vira Pedido → Pedido segue para Faturamento e para o Frete executar.

### Como validar no preview

1. Aprove uma simulação como Gestor.
2. Entre em **Fretes** como Frete/Financeiro/Admin: a operação aparece na aba **Preparação** com o rótulo "Ainda não virou pedido • bloqueada para execução".
3. Confirme que o botão de avançar e o "Gerar link do motorista" estão desabilitados.
4. Pague/valide/converta a proposta; após o faturamento, o mesmo frete migra para **Liberados** e as ações são habilitadas.

# Fluxo Operacional

## Onda - Automacao Financeira e Liberacao do Frete

Fluxo validado para esta onda:

1. Comercial cria a simulacao.
2. Financeiro revisa a primeira etapa de aprovacao.
3. Gestor faz a aprovacao final.
4. A simulacao aprovada vira pedido.
5. O sistema gera contas a receber e contas a pagar previstas.
6. O Financeiro recebe a operacao para baixa dos pagamentos necessarios.
7. O Frete ja visualiza o pedido, mas bloqueado como `Aguardando liberacao financeira`.
8. Quando as contas a pagar do pedido sao baixadas, o pedido muda para `Aguardando frete`.
9. O Frete pode cadastrar transportadora, motorista, veiculo, documentos e gerar o link do motorista.
10. O motorista atualiza a entrega pelo portal temporario.

O Supabase segue como fonte principal em producao. O LocalStorage fica como fallback de desenvolvimento.
