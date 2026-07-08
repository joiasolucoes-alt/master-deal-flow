# Fluxo do motorista

## Situacao atual

O motorista nao tem usuario administrativo. Ele acessa um link temporario gerado no modulo de Fretes, informa PIN e atualiza a entrega.

## Regra no novo fluxo

O link real do motorista so deve ser gerado depois que:

1. Gestor aprova a proposta.
2. Financeiro registra pagamento e comprovante.
3. Comercial valida o comprovante.
4. Pedido e confirmado.
5. Frete fica liberado.

Antes disso, o Frete pode preparar dados, mas nao deve acionar motorista.

## Etapas do motorista

1. Cheguei para carregar.
2. Carregado.
3. Em viagem.
4. Cheguei no destino.
5. Entregue/finalizado.
6. Comprovante/canhoto anexado, quando disponivel.

## Pendencias futuras

- Melhorar upload real do canhoto no portal externo.
- Reforcar RLS e Edge Functions para o fluxo publico.
- Alertar Comercial e Financeiro a cada mudanca relevante de entrega.
