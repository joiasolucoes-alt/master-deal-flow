# Refinamento de RLS por papel

## Contexto

RLS (Row Level Security) é a trava do banco que decide quem lê/escreve cada linha. Hoje, a
maior parte das tabelas do fluxo comercial roda com a política provisória
`003_basic_rls_for_homologation.sql`: **qualquer usuário autenticado lê e escreve tudo**
(`using (true)`). Isso foi aceito para a homologação, mas é citado como dívida pendente em
vários documentos (`current-status.md`, `permissions.md`, `next-recommendations.md`,
`supabase-setup.md`).

Este documento e o script `supabase/manual-sql/021_role_based_rls.sql` propõem fechar essa
dívida.

## Padrão de referência (já em produção)

A migration `202607070001_negotiation_wallets.sql` **já usa RLS por papel** nas tabelas de
carteira, com o padrão:

- **Leitura**: qualquer membro da organização dona da linha (`organization_members`).
- **Escrita**: apenas papéis operacionais (`admin`, `gestor`, `financeiro`, `frota`…).

O script 021 aplica exatamente esse padrão às tabelas do fluxo comercial. Ele **não depende**
das funções da trilha alternativa `sql/001` (usa `exists (...)` inline).

## Estado real do `organization_id` (confirmado pelo diagnóstico)

O diagnóstico (`supabase/diagnostics/001_quick_report.sql`) mostrou que `organization_id`
existe só na **metade** das tabelas. Por isso o script 021 trata dois grupos:

- **Com `organization_id`** → RLS por papel real (membro da organização):
  `clients`, `suppliers`, `products`, `freights`, `deliveries`, `financial_titles`
  (+ carteiras, que já tinham RLS por papel mas estavam anuladas por policies abertas).
- **Sem `organization_id`** → o 021 apenas **desduplica** para uma política de autenticado
  (sem ganho de isolamento, só limpeza): `simulations`, `orders`, `order_items`, `approvals`,
  `freight_documents`, `audit_events`, `notifications`.

### Isolando o segundo grupo (scripts 023 → 024)

Para `simulations`/`orders`/`order_items`/`approvals`, o caminho já está preparado:

1. `diagnostics/002_org_backfill_readiness.sql` — confirma nº de organizações e colunas.
2. `manual-sql/023_add_organization_id_to_core_tables.sql` — adiciona `organization_id`
   e faz backfill (caminho de organização única por padrão; `order_items`/`approvals`
   herdam do pai).
3. `manual-sql/024_role_based_rls_core_tables.sql` — troca as policies provisórias do 021
   por RLS por organização. **Só rode após 023 com 0 nulos.**

`freight_documents`, `audit_events` e `notifications` seguem no nível de autenticado por ora
(podem ser isoladas depois: `freight_documents` via JOIN no pai `freights`; `notifications`
por usuário-alvo; `audit_events` append-only). Isolamento **por dono** (Comercial vê só os
seus) continua sendo decisão de produto — exige um vínculo estável com `auth.uid()`
(ver bloco final do 024).

## Pré-requisitos (obrigatórios)

1. **`organization_members` populada.** Sem membros cadastrados, a RLS por papel bloqueia tudo
   — comportamento correto, mas exige cadastrar os usuários primeiro. Confirme quais papéis
   existem (inclusive `frota`, que vira o perfil `Frete`) antes de aplicar.
2. Para levar o isolamento às tabelas do segundo grupo, primeiro adicione a coluna de
   organização/dono e faça backfill — ver o bloco final do script 021.

## Como aplicar com segurança

1. Rode em um **branch/preview do Supabase**, nunca direto em produção.
2. Confirme os pré-requisitos acima.
3. Aplique `021_role_based_rls.sql`.
4. Teste cada perfil (Comercial, Financeiro, Aprovador, Frete, Admin): login, leitura e escrita
   nas áreas que cada um deve acessar.
5. Só então replique em produção, em janela de baixo movimento.
6. **Reversão**: reaplicar `003_basic_rls_for_homologation.sql` restaura as políticas abertas.

## Estado APLICADO (2026-07, banco de homologação)

Os scripts `022 → 021 → 023 → 024` foram aplicados e validados sob RLS (impersonando um
usuário autenticado real): financial_titles (51), simulations (6), orders (3), freights (7),
clients (6) — todos visíveis. Descobertas e ações durante a aplicação:

- **Bug `min(uuid)`**: o backfill usava `min(id)` (inexistente para uuid). Trocado por
  `select id ... limit 1` (organização única). Corrigido em 021 e 023.
- **`organization_members` sem policy** (RLS ligada, 0 policies = nega tudo): fazia a
  subconsulta `exists(...)` de TODAS as policies rbac_* retornar 0, escondendo tudo. Corrigido
  com `rbac_read_own_membership` (`user_id = auth.uid()`, não recursiva) — **PASSO 1.5 do 021**.
  Sem essa policy, todo o esquema de RLS por papel não funciona.

### Follow-up conhecido (não bloqueante)

Tabelas ainda com policies abertas (não estavam no escopo do 021, seguem legíveis como antes):
`negotiations`, `profiles`, `units`, `realized_results` e as filhas de simulação
(`simulation_items`, `simulation_costs`, `simulation_purchase_costs`, `simulation_installments`).
Num cenário de organização única com todos admin isso não vaza nada; para multi-org, dar a elas
o mesmo tratamento (org-based onde houver `organization_id`; herança do pai nas filhas de
simulação).

## O que fica para uma próxima etapa (decisão de produto)

Visibilidade **por linha** para o perfil Comercial (ver só os próprios registros), espelhando
`src/lib/visibility.ts`. Está **bloqueada por dado**: `responsible_id` é 100% nulo em
`simulations`/`orders` (embora `profiles.auth_user_id` exista). Exige o app passar a gravar
esse vínculo. Há um exemplo comentado no fim do script 024.
