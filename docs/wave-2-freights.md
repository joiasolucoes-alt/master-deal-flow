# Onda 2 - Fretes v1

## O que entrou

- Criação de fretes a partir de pedidos liberados.
- Tela Fretes usando dados reais do app, não lista fixa.
- Avanço de status do frete: cotação, contratado, carregando, em rota e entregue.
- Atualização automática do status/progresso de entrega do pedido.
- Persistência local preservada e persistência Supabase preparada.

## Como validar

1. Acesse `Fretes`.
2. Clique em `Gerar fretes dos pedidos`.
3. Confira se cada pedido liberado ganhou um frete.
4. Clique em `Avançar` no frete.
5. Confira se o status do frete muda.
6. Abra `Pedidos` ou `Entregas` e confira se o pedido refletiu o avanço logístico.

## SQL necessário

Antes de usar com Supabase, rode:

`supabase/manual-sql/005_wave_2_freights.sql`

## Ainda não incluso

- Cotação real com transportadoras.
- Edição detalhada de veículo, motorista e placas pela tela.
- Comprovante de entrega.
- Ocorrências de entrega.
- Integração com TMS, ERP ou rastreamento externo.
