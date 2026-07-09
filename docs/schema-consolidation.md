# Consolidação de Schema — conflitos a resolver antes do próximo deploy

Este documento registra **divergências reais entre arquivos SQL do repositório** encontradas
numa leitura completa do código. Nenhuma delas foi "corrigida" automaticamente porque a
correção depende de saber **o que já está aplicado no seu Supabase de produção** — informação
que não está no código. O objetivo aqui é transformar o risco implícito em uma decisão
explícita e rastreável.

> ⚠️ Regra do projeto: nenhum SQL é aplicado automaticamente (ver `docs/manual-sql.md` e
> `docs/supabase-setup.md`). Tudo abaixo é para revisão e aplicação manual e ordenada no SQL
> Editor.

---

## Estado confirmado pelo diagnóstico (2026-07)

Rodando `supabase/diagnostics/001_quick_report.sql` no banco de produção, os conflitos
deixaram de ser hipóteses. Resumo do que está **de fato** aplicado:

- **Trilha de schema: A (waves). CONFIRMADO.** `freights`/`deliveries`/`financial_titles` têm
  `external_id`, `driver_cpf`, `cargo_type`, `proof_file_path`, `simulation_external_id` — a
  trilha B (`sql/001`) **não** está viva. O bucket `master-flow-documents` (exclusivo da B)
  não existe. → Conflito 1 resolvido: adotar A, aposentar B.
- **`organization_id` está pela metade.** Existe em `clients`, `suppliers`, `products`,
  `freights`, `deliveries`, `financial_titles`; **falta** em `simulations`, `orders`,
  `order_items`, `approvals`, `freight_documents`, `audit_events`, `notifications`. Isso
  divide a RLS em dois grupos (ver `docs/rls-refinement.md` e `manual-sql/021`).
- **Políticas abertas empilhadas.** Cada tabela acumulou 2–4 gerações de policy `using (true)`
  (`wave_1_1_*`, `authenticated_*`, `wave_2_*`, `wave_3_*`). Limpeza no `manual-sql/021`.
- **🔓 RLS das carteiras ANULADA.** `negotiation_wallets` e `negotiation_wallet_entries` têm as
  policies por papel corretas **e também** `wave_2_*` com `using (true)`. Como o Postgres
  combina policies permissivas com **OU**, hoje qualquer autenticado lê/escreve as carteiras.
  Corrigido no `manual-sql/021` (remove as dupes abertas).
- **Constraint dupla em `freights.status`.** Coexistem `freights_status_check` (6 valores
  canônicos) e `freights_status_driver_tracking_check` (união gigante PT+EN+eventos). Como
  CHECKs são combinadas com **E**, o efetivo já é a interseção = os 6 canônicos. A gigante é
  letra morta enganosa. Corrigido no `manual-sql/022`.

---

## Conflito 1 — Duas definições concorrentes de `financial_titles`, `freights` e `deliveries`

Existem **duas trilhas de schema** que criam as mesmas três tabelas, ambas com
`create table if not exists` (ou seja, a que rodar primeiro "vence" e a segunda é ignorada
silenciosamente):

| Trilha | Arquivos | Características |
| --- | --- | --- |
| **A — Waves (a que o frontend usa)** | `supabase/manual-sql/004_wave_2_financial_titles.sql`, `005_wave_2_freights.sql`, `006_wave_2_deliveries.sql` (+ 007, 009–011, 015–020) | Campos `external_id`, `order_external_id`, `unit_name`, checklist/documentos/canhoto. Sem `organization_id` obrigatório. É o que os repositórios em `src/features/*/repositories/` esperam. |
| **B — Multiempresa (trilha alternativa)** | `supabase/sql/001_master_flow_multitenant.sql` | Mesmas tabelas, porém com `organization_id not null`, RLS por papel real (`has_role`, `is_member_of_organization`) e estrutura mais enxuta, **sem** os campos de checklist/documento/canhoto das waves 2–4. |

Segundo o próprio `supabase/sql/README.md`, a trilha B foi preparada mas **os repositórios do
frontend não foram trocados para ela** — as telas seguiram na trilha A. Portanto, na prática:

- Se o seu banco rodou a **trilha A** (waves): está alinhado com o frontend. ✅
- Se rodou a **trilha B** (`sql/001`) antes das waves: as waves 2–4 podem ter falhado ou os
  campos novos (checklist, canhoto, comprovante) podem estar ausentes. ⚠️

### Decisão necessária

1. Confirmar no SQL Editor qual estrutura a tabela `freights` realmente tem hoje
   (ex.: `select column_name from information_schema.columns where table_name = 'freights';`).
2. Adotar **uma** trilha como canônica. A recomendação técnica é **manter a trilha A** (é a que
   o frontend consome) e **portar dela** apenas o que falta da trilha B — em especial a **RLS
   por papel** (ver `docs/rls-refinement.md` / script `manual-sql/021`).
3. Marcar a trilha perdedora como histórica (não apagar: manter para rastreabilidade, com o
   aviso já inserido no topo do arquivo).

---

## Conflito 2 — Três implementações do portal do motorista

| Desenho | Arquivos | Autenticação | Eventos |
| --- | --- | --- | --- |
| **Antigo (obsoleto)** | `supabase/sql/driver_public_tracking.sql` | Só token (sem PIN) | `arrived_pickup`, `loaded`, `in_transit`, `delivered`, `proof_uploaded` |
| **Atual (em uso)** | `supabase/manual-sql/018_temporary_driver_portal.sql` **==** `supabase/migrations/202607070003_driver_portal.sql` | Token **+ PIN** (hash SHA-256, lock por tentativas) | `arrived_loading`, `in_transit`, `arrived_delivery_location`, `unloaded`, `proof_uploaded`, `completed` |

O frontend (`src/lib/driverTracking.ts`, `src/routes/motorista.$token.tsx`) e as edge
functions (`supabase/functions/driver-*`) usam **o desenho atual (token + PIN)**. O arquivo
`driver_public_tracking.sql` é de um desenho anterior, incompatível (tabelas, RPCs e eventos
diferentes), e permanece no repositório sem marcação — risco de alguém aplicá-lo por engano.

### Decisão necessária

- Confirmar que `driver_public_tracking.sql` **não** foi aplicado (ou foi substituído) no
  Supabase atual.
- O arquivo recebeu um banner de obsolescência no topo apontando para este documento. Após
  confirmação, pode ser removido em uma limpeza futura.

---

## Conflito 3 — Constraint de `status` de `freights` alterada 4× (já quebrou produção)

A constraint `check (status in (...))` de `freights` foi redefinida em `005`, `007`, no
`driver_public_tracking.sql` e em `018`/`202607070003`. O comentário do próprio
`supabase/manual-sql/007_fix_freight_status_constraint.sql` admite que uma migration anterior
(o rastreamento público) **restringiu demais a constraint e quebrou o app em produção**.

Hoje convivem, na mesma coluna, valores em inglês (`quoted`, `hired`, `in_route`…), em
português (`Cotação`, `Aprovado`, `Em rota`, `Entregue`) e nomes de evento do motorista
(`arrived_loading`, `unloaded`…).

### Decisão necessária — RESOLVIDA em `manual-sql/022`

O diagnóstico confirmou que só os 6 valores canônicos (`quoted`, `hired`, `loading`,
`in_route`, `delivered`, `cancelled`) passam hoje (interseção das duas CHECK), e que isso
casa com o `FreightStatus` de `src/features/freights/freightHelpers.ts`. O script
`manual-sql/022_fix_freights_status_constraint.sql` remove a constraint gigante enganosa e
deixa apenas a canônica. Os eventos do motorista vão para `freight_events`, não para
`freights.status`.

---

## Resumo das ações (todas manuais, sob revisão)

- [x] ~~Inspecionar o schema real em produção~~ → feito via `diagnostics/001_quick_report.sql`.
- [x] ~~Escolher a trilha canônica~~ → **A (waves)**, confirmada.
- [ ] Confirmar não-uso de `driver_public_tracking.sql` e planejar remoção (banner já aposto).
- [ ] Aplicar `manual-sql/022` (constraint de `status`) após validação em preview.
- [ ] Aplicar `manual-sql/021` (RLS por papel + limpeza de policies abertas) após revisão — ver
      `docs/rls-refinement.md`. **Fecha o buraco da RLS das carteiras.**
- [ ] Decisão de produto: adicionar `organization_id` (ou `owner_user_id`) em `simulations`/
      `orders`/`order_items`/`approvals` para isolamento real por org/dono (hoje sem coluna).
