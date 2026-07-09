# Onda 4 - Checklist do frete e conta a pagar

## O que entrou

- A aba **Fretes** foi redesenhada em duas colunas (lista + detalhe em abas):
  - **Resumo**: transportadora, tipo de carga, trajeto, datas.
  - **Motorista**: dados + checklist de documentos (CNH, CPF, contato, vínculo, dados bancários, selfie).
  - **Veículo**: descrição, placas, ANTT + checklist (CRLV cavalo, CRLV carreta, RNTRC/ANTT, proprietário, autorização).
  - **Operação**: proposta, contrato, ordem de coleta, NF, CT-e/MDF-e, seguro, comprovante pagamento, pedágio, canhoto final.
  - **Pagamento**: valor + data prevista de pagamento ao transportador → gera conta a pagar automática.
  - **Rastreamento**: link + PIN temporário do motorista (com gate de checklist).
- Cada documento indica se é **Obrigatório** ou **Opcional** com base no tipo de carga (perigosa, excesso, refrigerada, rastreada exigem documentos extras).
- Botão único de **Avançar** por frete: contratar → carregar → em rota → finalizar. Cada avanço tem um gate:
  - **Contratar** exige documentos do motorista e do veículo obrigatórios + dados básicos (transportadora, motorista, placa, valor, data de pagamento).
  - **Iniciar carregamento** exige checklist de operação (ordem de coleta e NF).
  - **Finalizar entrega** exige o canhoto/comprovante anexado.
- **Conta a pagar do frete** é criada/atualizada quando o usuário salva valor + data prevista de pagamento. Vai direto para a tela Financeiro como título `payable` com o número `PEDIDO-PAG-FRETE`.

## SQL necessário

Antes de usar com Supabase, rode:

`supabase/manual-sql/020_wave_4_freight_checklist.sql`

## Como validar

1. Acesse **Fretes** e selecione um frete.
2. Na aba **Motorista**, preencha nome, CPF, telefone, vínculo e anexe CNH.
3. Na aba **Veículo**, preencha placas e ANTT e anexe CRLV do cavalo.
4. Na aba **Operação**, anexe proposta e contrato.
5. Na aba **Pagamento**, informe valor + data prevista e salve → confira o título em **Financeiro**.
6. Volte para o Resumo e clique em **Contratar**. Só avança se o checklist estiver completo.
7. Anexe ordem de coleta e NF, clique **Iniciar carregamento**.
8. Vá para a aba **Rastreamento** e gere o link do motorista (só libera se checklist e financeiro OK).

## Ainda não incluso

- OCR/validação automática dos documentos.
- Integração com ANTT/SINTEGRA para validar CNH ou RNTRC.
- Ocorrências e comprovante de entrega pela tela do frete (o motorista já anexa via link temporário).
