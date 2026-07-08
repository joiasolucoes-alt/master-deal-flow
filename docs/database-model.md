# Onda atual - campos adicionados

Novo SQL manual `019_pre_order_payment_release.sql` adiciona:

- em `simulations`: campos de pagamento, comprovante e validacao comercial;
- em `financial_titles`: vinculo com proposta (`simulation_external_id`, `simulation_number`) e dados de comprovante;
- constraints de status atualizadas para aceitar pre-pedido, pagamento, validacao comercial e pedido confirmado.

# Modelo de banco

A primeira onda do banco cobre o fluxo principal do Master Flow: simulacao, aprovacao e pedido.

## Tabelas principais

- `profiles`: usuarios e perfis de acesso.
- `units`: unidades operacionais.
- `clients`: clientes.
- `suppliers`: fornecedores.
- `products`: produtos.
- `negotiations`: negociacoes comerciais.
- `simulations`: cabecalho da simulacao.
- `simulation_items`: produtos da simulacao.
- `simulation_costs`: despesas da simulacao.
- `simulation_purchase_costs`: NF/custos da simulacao.
- `simulation_installments`: parcelas previstas.
- `approvals`: registros de aprovacao, ajuste ou rejeicao.
- `orders`: pedidos gerados a partir de simulacoes aprovadas.
- `order_items`: itens do pedido.
- `audit_events`: historico de eventos.
- `notifications`: notificacoes basicas.

## Onda 1.1

A Onda 1.1 reforca:

- `approvals`: checklist, comentario, status, aprovador e data da decisao.
- `clients`: CRUD basico com inativacao logica.
- `suppliers`: CRUD basico com inativacao logica.
- `products`: CRUD basico com codigo, descricao, unidades por caixa, custo e preco padrao.

## IDs externos

As tabelas principais possuem `external_id`. Esse campo guarda o ID que o frontend ja usa hoje, como `sim-...` ou `ord-...`.

Isso evita quebrar o fluxo atual enquanto o banco usa UUID internamente.

## Calculos

Os calculos continuam no frontend em:

```text
src/lib/calculations.ts
```

Ao salvar uma simulacao no Supabase, o app tambem grava totais calculados:

- receita
- custo de mercadoria
- despesas
- lucro bruto
- lucro liquido
- margem liquida
- status de viabilidade

## RLS

Todas as tabelas estao com RLS ativo. Nesta onda, as politicas sao simples:

- usuario autenticado pode consultar
- usuario autenticado pode inserir
- usuario autenticado pode atualizar
- delete fica restrito, exceto tabelas filhas usadas para substituir itens da simulacao/pedido

As regras por perfil, unidade e responsabilidade ainda nao foram aplicadas nesta etapa.
# Complemento - Onda Automacao Financeira e Liberacao do Frete

Nenhuma tabela nova foi criada nesta onda.

Estruturas reutilizadas:

- `orders`: pedido gerado a partir da simulacao aprovada.
- `financial_titles`: tabela unica para contas a pagar e contas a receber.
- `freights`: fretes vinculados ao pedido.
- `freight_documents`: documentos de frete.
- `driver_access_links`: acesso temporario do motorista.
- `freight_events`: eventos do motorista/frete.
- `delivery_proofs`: comprovantes de entrega.
- `notifications`: notificacoes internas.
- `audit_events`: historico de operacoes persistidas pelos repositorios Supabase.

Regra aplicada no frontend:

- o frete e liberado quando todos os titulos `payable` do pedido estiverem pagos;
- contas `receivable` seguem acompanhadas, mas nao bloqueiam o frete nesta onda.
