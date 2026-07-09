
## Situação atual (que li no código)

- `src/routes/_app.fretes.tsx` tem tabela + formulário inline + card de acesso do motorista, tudo empilhado numa tela só.
- `FreightDocumentType` hoje só aceita 4 tipos genéricos: `contract | proposal | invoice | other`. Não há categorização motorista / veículo / operação nem controle de obrigatoriedade.
- Não há checklist de "pronto para contratar" nem gate para gerar o link do motorista baseado em documentos obrigatórios (hoje o único gate é `isOrderFinanciallyReleased`).
- `createPayableTitlesFromOrder` já cria um título "PAG-FRETE" a pagar, mas a data de vencimento é forçada em `freight.pickupDate` — não existe campo editável de "data prevista de pagamento do frete" na UI, e o título só nasce via `createPayableTitlesFromOrder` (fluxo do pedido), não quando o frete é contratado.
- `FreightRecord` não tem: transportadora tipo, CNH, RNTRC/ANTT, placa da carreta, telefone do motorista, tipo de carga, data prevista de pagamento do frete.

## O que vou entregar

### 1. Modelo de dados do frete (backend + tipos)

Adicionar em `FreightRecord`:
- `driverCpf`, `driverPhone`, `driverEmploymentType` ("autonomo" | "transportadora")
- `trailerPlate`, `anttRegistration`
- `carrierDocument` (CNPJ/CPF)
- `cargoType` ("comum" | "perigosa" | "refrigerada" | "excesso") — controla documentos condicionais
- `freightPaymentDueDate` (data prevista de pagamento ao transportador)
- `freightPaymentTitleId` (referência ao título financeiro gerado)

SQL nova onda: `020_wave_4_freight_checklist.sql`:
- ALTER TABLE freights: novas colunas acima.
- ALTER TABLE freight_documents: coluna `block` ("driver" | "vehicle" | "operation") e `required` boolean para snapshot da regra no momento do upload.

### 2. Catálogo de documentos + checklist

Novo módulo `src/features/freights/freightChecklist.ts`:

```text
Bloco Motorista (obrigatórios p/ contratar):
  - CNH, CPF/RG, telefone, vínculo com transportadora/autônomo
  Opcionais: dados bancários/PIX, foto selfie

Bloco Veículo (obrigatórios p/ liberar carregamento):
  - CRLV cavalo, placas, RNTRC/ANTT
  Condicionais: CRLV carreta (se conjunto), doc proprietário/autorização (se veículo de terceiro)

Bloco Operação (obrigatórios p/ contratar):
  - Proposta, contrato/aceite, previsão coleta e entrega, valor do frete
  Condicionais por carga: MOPP (perigosa), AET (excesso), certificados (refrigerada)
  Finais: NF mercadoria, CT-e/MDF-e, seguro, comprovante pagamento, canhoto entrega
```

Funções:
- `getRequiredDocuments(freight)` → lista de docs obrigatórios dado tipo de carga
- `getChecklistStatus(freight, documents)` → `{ driver, vehicle, operation, canContract, canReleaseDriver, canFinalize }`

### 3. Fluxo de contratação (gates)

Atualizar `_app.fretes.tsx` para bloquear ações baseado no checklist:
- **Avançar para "hired"**: só se bloco Motorista + Veículo + Operação (obrigatórios de contratação) completos.
- **Gerar link do motorista**: só se `isOrderFinanciallyReleased` E checklist "canReleaseDriver".
- **Marcar como entregue**: já existe, mantém, mas exige canhoto anexado (comprovante).

### 4. Conta a pagar do frete com data prevista

- Novo campo `freightPaymentDueDate` no formulário (datepicker), exibido ao lado do valor do frete.
- Ao salvar o frete com valor > 0 e data preenchida, chamar novo helper `upsertFreightPayableTitle(freight, order, existingTitles)` que:
  - cria/atualiza `FinancialTitle` tipo `payable`, `titleNumber = FRETE-{código}`, `dueDate = freightPaymentDueDate`, `amount = freightValue`, `client = carrierName`, `notes` com dados do frete.
  - vincula pelo id e reflete no financeiro automaticamente.
- Se o valor/data mudar, atualizar o mesmo título (não duplicar).
- Se frete for cancelado, marcar título como `cancelled`.

### 5. UX redesenhada da aba Fretes

Layout novo (arquivo continua `src/routes/_app.fretes.tsx`, mas quebrado em componentes menores em `src/features/freights/components/`):

```text
┌─ PageHeader + botão "Gerar fretes dos pedidos" ─┐
├─ Stat cards (mantidos)                          ┤
├─ Layout 2 colunas em telas grandes:             ┤
│  ┌─ Coluna esquerda: lista compacta ──────────┐ │
│  │ Card por frete com:                        │ │
│  │  - código, pedido, cliente                 │ │
│  │  - badge status logístico                  │ │
│  │  - badge liberação financeira              │ │
│  │  - progresso do checklist (x/y docs)       │ │
│  │  - CTA "Avançar" contextual                │ │
│  └────────────────────────────────────────────┘ │
│  ┌─ Coluna direita: detalhe em abas ──────────┐ │
│  │ Tabs: Resumo | Motorista | Veículo |       │ │
│  │       Operação | Motorista (link) | Timeline│ │
│  │  - cada aba de documentos mostra checklist │ │
│  │    com ✓ / pendente / obrigatório         │ │
│  │  - upload contextual dentro da aba correta │ │
│  └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

Componentes novos:
- `FreightListCard` — item da lista com progresso do checklist
- `FreightDocumentsBlock` — card genérico que renderiza um bloco (motorista/veículo/operação) com upload inline e checklist
- `FreightSummaryPanel` — dados principais + valores + gates
- `FreightPaymentBlock` — valor + data prevista + status do título gerado
- Manter `DriverAccessCard` (já existe) mas mover para aba do detalhe

### 6. Timeline visual do frete

Reusar `Timeline` component para mostrar: Cotação → Contratação (docs completos) → Liberação financeira → Carregamento → Em rota → Entregue.

## Notas técnicas

- Sem quebra de compatibilidade: colunas novas são opcionais, defaults preservam comportamento atual.
- `freightDocumentStorage.ts` ganha campo `block` no `saveFreightDocument` e `listFreightDocuments` retorna com o bloco.
- Tudo continua funcionando em modo local (localStorage) sem Supabase; SQL 020 só é necessário para persistir os novos campos.
- Documentação nova: `docs/wave-4-freight-checklist.md` explicando os 3 blocos, obrigatoriedade, e o gate de conta a pagar.

## O que NÃO entra

- OCR / validação automática dos documentos (só upload + marcação humana).
- Integração real com ANTT/SINTEGRA para validar CNH ou RNTRC.
- Fluxo de MOPP, seguro e demais condicionais além de listá-los no checklist (upload manual).
- Alteração no fluxo do motorista (`motorista.$token.tsx`) — ele já anexa canhoto ao finalizar.

Confirma que posso seguir com esse escopo? Se quiser cortar algo (por exemplo, deixar a UX redesenhada para depois e focar só nos documentos + conta a pagar), me avisa antes de eu começar.
