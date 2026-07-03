# Status atual - Onda 1.1

O Master Flow está preparado para homologar o fluxo comercial até pedido.

## Pronto para validar

- Login com Supabase Auth iniciado, com fallback local.
- Dashboard e navegação principal.
- Central de simulações.
- Criação, edição, rascunho e duplicação de simulações.
- Envio de simulação para aprovação.
- Central de aprovações com checklist, comentário e decisão.
- Aprovação, devolução para ajuste e reprovação.
- Conversão de simulação aprovada em pedido.
- Central e detalhe de pedidos.
- Cálculos da planilha 374 no frontend.
- Persistência opcional com Supabase via `VITE_DATA_PROVIDER=supabase`.
- CRUD básico de clientes, fornecedores e produtos em Configurações.
- Diagnóstico técnico em ambiente de desenvolvimento.

## Ainda provisório

- O modo local continua como fallback e para testes offline.
- RLS por perfil/unidade/responsável ainda deve ser refinado no banco.
- Financeiro, frete, entrega, comissão e lucro realizado ficam para próximas ondas.
- Notificações são básicas e ainda não têm uma central dedicada.

## SQL manual

Nenhum SQL foi aplicado automaticamente. Scripts para execução manual:

1. `supabase/manual-sql/001_approval_workflow_hardening.sql`
2. `supabase/manual-sql/002_catalog_crud_support.sql`
3. `supabase/manual-sql/003_basic_rls_for_homologation.sql`
