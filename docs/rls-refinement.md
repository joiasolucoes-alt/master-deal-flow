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

## Pré-requisitos (obrigatórios)

1. **Coluna `organization_id`** em todas as tabelas cobertas. As tabelas das waves
   (`financial_titles`, `freights`, `deliveries`, `freight_documents`) podem não ter essa
   coluna dependendo da trilha aplicada — ver `docs/schema-consolidation.md` (Conflito 1).
   Verifique com o `select` do cabeçalho do script 021. Se faltar, ou você adiciona a coluna
   + backfill antes, ou remove a tabela do script.
2. **`organization_members` populada.** Sem membros cadastrados, a RLS bloqueia tudo — que é o
   comportamento correto, mas exige cadastrar os usuários primeiro.

## Como aplicar com segurança

1. Rode em um **branch/preview do Supabase**, nunca direto em produção.
2. Confirme os pré-requisitos acima.
3. Aplique `021_role_based_rls.sql`.
4. Teste cada perfil (Comercial, Financeiro, Aprovador, Frete, Admin): login, leitura e escrita
   nas áreas que cada um deve acessar.
5. Só então replique em produção, em janela de baixo movimento.
6. **Reversão**: reaplicar `003_basic_rls_for_homologation.sql` restaura as políticas abertas.

## O que fica para uma próxima etapa (decisão de produto)

Visibilidade **por linha** para o perfil Comercial (ver só os próprios registros), espelhando
`src/lib/visibility.ts`. Depende de padronizar o nome da coluna de "responsável/dono" em
`simulations`/`orders` e decidir a regra exata. Há um exemplo comentado no fim do script 021.
