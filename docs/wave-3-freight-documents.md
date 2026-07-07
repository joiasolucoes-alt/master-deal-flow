# Onda 3 - Documentos de frete

## O que entrou

- Bloco de documentos dentro do detalhe do frete.
- Upload de contrato, proposta, nota/documento ou outro arquivo.
- Lista de arquivos anexados por frete.
- Abertura do arquivo salvo por link temporário seguro do Supabase.
- Validação de formato: PDF, JPG ou PNG.
- Limite de arquivo: 10 MB.

## Como validar

1. Rode o SQL `supabase/manual-sql/015_wave_3_freight_documents.sql`.
2. Acesse `Fretes`.
3. Clique em um frete no painel.
4. No bloco `Documentos do frete`, selecione o tipo do documento.
5. Escolha um PDF, JPG ou PNG.
6. Clique em `Anexar`.
7. Confira se o arquivo aparece na lista do frete.
8. Clique em `Abrir` para validar o link do arquivo.

## Observações

- Esta etapa precisa de SQL porque cria uma tabela nova para guardar os metadados do documento e um bucket no Supabase Storage para guardar o arquivo.
- O arquivo não fica no código do sistema; ele fica armazenado no Supabase.
- A regra de acesso ainda é simples para usuários autenticados. Regras por perfil/unidade podem ser refinadas em etapa futura.
