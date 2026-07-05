# Status atual - Onda 2 iniciada

O Master Flow já possui base funcional do fluxo comercial até pedido e iniciou a operação financeira pós-pedido.

## Pronto para validar

- Login com Supabase Auth iniciado, com fallback local.
- Cadastro de novo usuário pelo login, criando conta no Supabase e perfil inicial Comercial.
- Dashboard e navegação principal.
- Central de simulações.
- Criação, edição, rascunho e duplicação de simulações.
- Envio de simulação para aprovação.
- Central de aprovações com checklist, comentário e decisão.
- Aprovação, devolução para ajuste e reprovação.
- Conversão de simulação aprovada em pedido.
- Central e detalhe de pedidos.
- Financeiro com contas a receber geradas a partir de pedidos.
- Baixa simples de recebimento, atualizando o avanço de faturamento do pedido.
- Financeiro com contas a pagar geradas a partir dos custos do pedido e fretes com valor contratado.
- Baixa simples de pagamento.
- Fretes com geração a partir de pedidos liberados.
- Avanço de status do frete refletindo no progresso de entrega do pedido.
- Entregas com geração a partir de fretes liberados.
- Avanço de entrega e registro simples de ocorrência.
- Registro de canhoto/comprovante na entrega com recebedor, documento, referência de arquivo e observação.
- Histórico detalhado de ocorrências de entrega com tipo, local, responsável, data e descrição.
- Upload real de arquivo de comprovante/canhoto no Supabase Storage.
- Resultado realizado v1 em Relatórios, comparando margem prevista, margem realizada, receita recebida, custos pagos e comissão estimada.
- Fechamento oficial do resultado por pedido, gravando histórico na tabela `realized_results`.
- Aprovação formal de comissão no resultado realizado, liberada para Admin e Financeiro.
- Cálculos da planilha 374 no frontend.
- Persistência opcional com Supabase via `VITE_DATA_PROVIDER=supabase`.
- CRUD básico de clientes, fornecedores e produtos em Configurações.
- Diagnóstico técnico em ambiente de desenvolvimento.

## Ainda provisório

- O modo local continua como fallback e para testes offline.
- RLS por perfil/unidade/responsável ainda deve ser refinado no banco.
- Resultado realizado já grava fechamento oficial e aprovação de comissão; reabertura controlada fica para próxima evolução.
- Fechamento contábil definitivo ainda fica para próximas ondas.
- Financeiro ainda está na primeira versão: não há conciliação bancária, baixa parcial manual ou integração com banco.
- Frete ainda está na primeira versão: não há cotação real com transportadoras, cálculo de tabela ou comprovantes.
- Entrega ainda está na primeira versão: há upload de canhoto, mas ainda não há assinatura digital ou rastreamento externo.
- Notificações são básicas e ainda não têm uma central dedicada.

## SQL manual

Nenhum SQL foi aplicado automaticamente. Scripts para execução manual:

1. `supabase/manual-sql/001_approval_workflow_hardening.sql`
2. `supabase/manual-sql/002_catalog_crud_support.sql`
3. `supabase/manual-sql/003_basic_rls_for_homologation.sql`
4. `supabase/manual-sql/004_wave_2_financial_titles.sql`
5. `supabase/manual-sql/005_wave_2_freights.sql`
6. `supabase/manual-sql/006_wave_2_deliveries.sql`
7. `supabase/manual-sql/009_wave_2_delivery_proofs.sql`
8. `supabase/manual-sql/010_wave_2_delivery_occurrences.sql`
9. `supabase/manual-sql/011_wave_2_delivery_proof_uploads.sql`
10. `supabase/manual-sql/012_wave_1_3_realized_results.sql`
11. `supabase/manual-sql/013_wave_1_3_commission_approval.sql`
12. `supabase/manual-sql/014_self_signup_commercial_access.sql`
