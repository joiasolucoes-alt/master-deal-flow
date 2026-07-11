# Onda atual - pre-pedido, pagamento e liberacao operacional

Nova regra validada com o cliente: a proposta aprovada pelo Gestor nao vira pedido automaticamente. Ela entra em **Aguardando pagamento**, o Financeiro registra pagamento e comprovante, o Comercial valida esse comprovante e somente entao o sistema confirma o pedido e libera o frete.

Fluxo atual da onda: Comercial cria proposta -> Gestor aprova -> Financeiro paga/anexa comprovante -> Comercial valida -> Pedido confirmado -> Frete liberado -> Motorista/entrega -> Fechamento.

**Novidade (feat: expose approved simulations to freight preparation):** ao Gestor aprovar, a operação passa a ficar visível para o **Frete/Logística como preparação** (aba **Preparação** na tela de Fretes), em paralelo ao pagamento — mas a execução (contratação, link/PIN, carregamento, entrega, canhoto) continua **bloqueada** até a SIM virar Pedido e ser liberada no faturamento. Notificações vão para Financeiro, Frete e Comercial; auditoria registrada. Sem mudança de schema (reutiliza `freights.order_id NULL`). Ver `docs/operational-flow.md` e `docs/freight-flow.md`.

# Status atual - Onda 3 iniciada

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
- Financeiro v2 iniciado com baixa parcial/manual de contas a receber e contas a pagar.
- Saldo em aberto por título financeiro e atualização proporcional do faturamento do pedido.
- Fretes v2 iniciado com cadastro de documentos por frete: contrato, proposta, nota/documento e outros anexos.
- Cálculos da planilha 374 no frontend.
- Persistência opcional com Supabase via `VITE_DATA_PROVIDER=supabase`.
- CRUD básico de clientes, fornecedores e produtos em Configurações.
- Diagnóstico técnico em ambiente de desenvolvimento.

## Ainda provisório

- O modo local continua como fallback e para testes offline.
- RLS por perfil/unidade/responsável ainda deve ser refinado no banco.
- Resultado realizado já grava fechamento oficial e aprovação de comissão; reabertura controlada fica para próxima evolução.
- Fechamento contábil definitivo ainda fica para próximas ondas.
- Financeiro ainda não possui conciliação bancária ou integração com banco.
- Frete já possui cadastro operacional e documentos anexos; ainda não há cotação real com transportadoras ou cálculo automático por tabela.
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
13. `supabase/manual-sql/015_wave_3_freight_documents.sql`

## Onda 3

1. `docs/wave-3-finance-v2.md`
2. `docs/wave-3-freight-documents.md`
# Atualizacao - Onda Automacao Financeira e Liberacao do Frete

Nesta onda, o fluxo passa a tratar o pedido como uma operacao conectada entre Comercial, Financeiro e Frete.

Implementado nesta rodada:

- pedido aprovado pelo Gestor gera contas financeiras previstas automaticamente;
- contas a receber sao criadas pela condicao de pagamento;
- contas a pagar sao criadas pela composicao de compra e despesas da simulacao;
- frete passa a visualizar o pedido desde o nascimento;
- frete fica bloqueado ate a baixa financeira das contas a pagar;
- baixa financeira libera o pedido para o frete;
- notificacoes internas sao geradas para Comercial, Financeiro e Frete.

Pendente para ondas futuras:

- anexos de comprovantes financeiros;
- boleto real/integracao bancaria;
- permissao especifica para papel de Frete;
- RLS refinada por organizacao, unidade e responsabilidade;
- relatorio previsto x realizado completo.
