# Fluxo do Motorista — Link externo + PIN

Jornada externa do motorista/entregador: acessa por **link temporário + PIN**, atualiza o
andamento da operação, registra ocorrências e finaliza a entrega **anexando o canhoto
assinado**. O comprovante volta para os painéis internos (Frete, Financeiro, Pedido).

> **Quando o link/PIN é gerado (fix: separate freight release from financial invoicing):**
> o link/PIN é gerado pelo **Frete/Admin** após a **contratação** do frete — que já é possível
> assim que o pedido é confirmado, **sem** depender do faturamento. A partir do momento em que
> o motorista assume, os status operacionais passam a vir do **checklist externo**, não do painel interno.

## Onde entra no fluxo geral

```
... Frete contrata o motorista → gera LINK + PIN (tela de Fretes)
→ Motorista abre /motorista/:token → valida PIN
→ Marca marcos (checklist) → registra ocorrências (se houver)
→ Anexa o canhoto assinado (obrigatório) → Finaliza
→ Frete/Financeiro/Pedido veem entrega concluída + comprovante
```

## Como o Frete gera o acesso

Na tela de **Fretes**, na aba **Rastreamento → Acesso do motorista**, o botão gera:

- um **token** (na URL do link) e um **PIN** de 6 dígitos;
- ambos aparecem **uma única vez** no momento da geração (no banco ficam apenas hashes SHA‑256);
- o link tem validade (expiração) e pode ser **revogado**.

O motorista recebe o link (ex.: WhatsApp) e o PIN separadamente.

## O que o motorista vê (e o que NÃO vê)

**Vê** (somente da operação daquele link): nº do frete, motorista, placa, origem de coleta,
destino de entrega, status atual e o checklist.

**Não vê**: margem, lucro, comissão, custos internos, dados administrativos ou de outros
pedidos. A página é pública e limitada — não dá acesso ao sistema interno.

## Checklist / status (marcos persistidos)

O banco persiste os **marcos** que definem o status do frete/pedido:

| Marco (event_type) | Ação do motorista | Status do frete |
| --- | --- | --- |
| `arrived_loading` | Cheguei para carregar | `loading` |
| `in_transit` | Estou em trânsito | `in_route` |
| `arrived_delivery_location` | Cheguei no destino | `in_route` |
| `unloaded` | Descarreguei (informa **recebedor**) | `delivered` |
| `proof_uploaded` | Anexa o **canhoto** (obrigatório) | `delivered` |
| `completed` | (automático após o canhoto) | `delivered` + pedido `Entregue` |

> Decisão de design: o checklist granular (confirmações de coleta/viagem/descarga) é
> apresentado na tela; o que é **persistido** são os 6 marcos acima + ocorrências. Isso mantém
> a máquina de status robusta e o histórico limpo.

**Ocorrências** (`occurrence`) são eventos **repetíveis**, não avançam o marco e notificam
Frete, Comercial e Financeiro. Tipos: atraso na coleta/entrega, cliente ausente, endereço
incorreto, problema na portaria, mercadoria divergente/avariada, falta de documento, problema
com veículo, acidente/sinistro, descarga recusada, outro motivo.

## Regra obrigatória do canhoto

**Não é possível finalizar a entrega sem anexar a foto do canhoto/comprovante assinado.**
Aceita JPG, PNG ou PDF (até 10 MB). O arquivo vai para o bucket **privado** `delivery-proofs`;
a leitura interna é feita via **URL assinada** temporária.

## Onde o comprovante aparece internamente

- **Frete** (detalhe do frete → Rastreamento): status, eventos do motorista e o canhoto.
- **Pedido** (detalhe do pedido → card **Entrega e comprovante**): situação da entrega, data,
  nome do recebedor, ocorrências e botão **Ver canhoto**. Financeiro e Comercial abrem o
  pedido para conferir.
- **Pedido.status** vira **Entregue** e `delivery_progress = 100` quando o canhoto é anexado.

## Backend (segurança)

Tudo passa por **RPCs `security definer`** no Supabase (validam token+PIN por hash, com
lockout após 5 tentativas). O frontend usa a chave **anon** (nunca `service_role`).

- `driver_link_auth(token, pin)` — valida acesso, registra tentativa, `last_access_at`,
  auditoria e notifica o Frete no primeiro acesso.
- `driver_trip_event(token, pin, event_type, …, receiver_name, receiver_document, notes)` —
  marca o próximo marco, atualiza o frete, audita e notifica.
- `driver_trip_occurrence(token, pin, occurrence_type, notes, …)` — registra ocorrência e
  notifica 3 áreas.
- `driver_proof_record(token, pin, file_path, …, receiver_name)` — grava o metadado do
  canhoto, finaliza a entrega, atualiza o **pedido** e notifica Frete/Financeiro/Comercial.

O upload do arquivo é feito pelo cliente direto no bucket (policy de INSERT para `anon`); o
registro do metadado é sempre pelo RPC (que valida token+PIN).

## SQLs necessários (rodar manualmente, nesta ordem)

1. `supabase/manual-sql/027_fix_driver_portal_pgcrypto.sql` — **corrige o erro do PIN**
   (`digest()` sem schema). Sem isto, todos os RPCs do motorista falham.
2. `supabase/manual-sql/028_driver_journey_expansion.sql` — ocorrências, recebedor,
   `last_access_at`, notificações + auditoria server-side, atualização do pedido e a policy de
   Storage para o upload do canhoto.

## Como validar no preview

1. Como **Frete**, gere o link + PIN de um frete liberado.
2. Abra `/motorista/<token>` em aba anônima.
3. Digite um PIN errado → mensagem amigável; digite o correto → entra.
4. Marque os marcos; registre uma ocorrência; na descarga informe o recebedor.
5. Tente finalizar **sem** o canhoto → bloqueado; anexe o canhoto → finaliza.
6. Como **Frete/Financeiro**, abra o pedido → card **Entrega e comprovante** com o canhoto.

## Pendências / próxima fase

- **Persistência de `financial_titles`** (recebíveis/pagáveis) no Supabase é um gap
  pré-existente — não afeta a jornada do motorista, mas o Financeiro depende disso para
  conciliação completa.
- **Notificações por papel**: o `028` grava `notifications.target_role`; o mapeamento no
  frontend por papel pode precisar de ajuste para exibição fina.
- **Hardening de produção**: publicar a edge function `driver-proof-upload` (código em
  `supabase/functions/`) e restringir a policy de upload anônimo.
- Checklist granular por sub-etapa e foto opcional em parada/ocorrência ficam para evolução.
