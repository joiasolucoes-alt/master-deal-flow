# Onda 2 - Entregas v1

## O que entrou

- Criação de entregas a partir de fretes liberados.
- Tela Entregas usando registros próprios de entrega.
- Avanço de status: pendente, carregando, carregado, em rota, no destino e entregue.
- Registro simples de ocorrência operacional.
- Histórico detalhado de múltiplas ocorrências por entrega.
- Registro de canhoto/comprovante com recebedor, documento, referência de arquivo e observação.
- Upload real de comprovante/canhoto em PDF, JPG ou PNG.
- Atualização automática do status/progresso de entrega do pedido.
- Persistência local preservada e persistência Supabase preparada.

## Como validar

1. Rode o SQL `006_wave_2_deliveries.sql`.
2. Acesse `Entregas`.
3. Clique em `Gerar entregas dos fretes`.
4. Avance uma entrega e confira o progresso.
5. Registre uma ocorrência e confira o alerta na entrega.
6. Abra novamente o formulário de ocorrência e registre uma segunda ocorrência.
7. Confira o histórico detalhado no card da entrega.
8. Rode o SQL `011_wave_2_delivery_proof_uploads.sql`.
9. Conclua uma entrega, clique em `Registrar` no bloco `Canhoto/comprovante`, selecione um PDF/JPG/PNG e salve.
10. Abra o arquivo pelo botão `Abrir arquivo`.
11. Abra o pedido relacionado e confira o reflexo no status logístico.

## Ainda não incluso

- Motorista acompanhando pelo celular.
- Rastreamento externo.
- Assinatura digital de recebimento.
