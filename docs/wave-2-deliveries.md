# Onda 2 - Entregas v1

## O que entrou

- Criação de entregas a partir de fretes liberados.
- Tela Entregas usando registros próprios de entrega.
- Avanço de status: pendente, carregando, carregado, em rota, no destino e entregue.
- Registro simples de ocorrência operacional.
- Atualização automática do status/progresso de entrega do pedido.
- Persistência local preservada e persistência Supabase preparada.

## Como validar

1. Rode o SQL `006_wave_2_deliveries.sql`.
2. Acesse `Entregas`.
3. Clique em `Gerar entregas dos fretes`.
4. Avance uma entrega e confira o progresso.
5. Registre uma ocorrência e confira o alerta na entrega.
6. Abra o pedido relacionado e confira o reflexo no status logístico.

## Ainda não incluso

- Upload de comprovante/canhoto.
- Histórico detalhado de múltiplas ocorrências.
- Motorista acompanhando pelo celular.
- Rastreamento externo.
- Assinatura digital de recebimento.
