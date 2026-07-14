import type {
  DeliveryRecord,
  FinancialTitle,
  FreightRecord,
  Negotiation,
  Order,
  OrderTimelineEvent,
  Simulation,
  SimulationProduct,
} from "@/data/types";
import {
  getProductCostTotal,
  getProductSaleTotal,
  getSimulationTotals,
} from "@/lib/calculations";
import { buildRealizedResults, summarizeRealizedResults } from "@/features/results/realizedResult";
import { ATTENTION_MARGIN_TARGET, MINIMUM_MARGIN_TARGET } from "@/lib/constants";
import { formatCurrency, formatPercent } from "@/lib/format";

/**
 * Camada de agregação de insights de negócios.
 *
 * Hoje uma `Negotiation` não possui vínculo explícito (FK) com simulações/pedidos,
 * então o vínculo é inferido por cliente + responsável. Quando adicionarmos um
 * `negotiationId` em `Simulation`/`Order`, basta priorizá-lo em {@link matchesNegotiation}
 * — o resto do módulo (timeline, métricas, produtos) continua igual.
 *
 * As funções são puras (sem React) de propósito: além de alimentarem o detalhe do
 * negócio, serão reaproveitadas pelas próximas lentes (Cliente e Produto).
 */

export interface NegotiationLinkedRecords {
  simulations: Simulation[];
  orders: Order[];
  deliveries: DeliveryRecord[];
}

export interface NegotiationProductBreakdown {
  code: string;
  product: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
  source: "pedido" | "simulação";
}

export interface NegotiationMetrics {
  expectedValue: number;
  simulatedRevenue: number;
  realizedRevenue: number;
  receivableOpenTotal: number;
  predictedMarginPercent: number;
  realizedMarginPercent: number;
  marginDeltaPercent: number;
  simulationCount: number;
  orderCount: number;
  deliveryCount: number;
  conversionRate: number;
  cycleDays: number | null;
  firstActivityAt: string | null;
  lastActivityAt: string | null;
}

/** Normaliza texto para comparação tolerante a acentos, caixa e espaços extras. */
function normalizeKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Decide se um registro (simulação/pedido/entrega) pertence à negociação.
 *
 * Prioriza o vínculo explícito `negotiationId` quando presente no registro: aí o
 * pertencimento é exato (e separa negócios do mesmo cliente). Sem ele, cai para o
 * heurístico por cliente + responsável — preservando o comportamento atual enquanto
 * os dados não têm `negotiationId` preenchido.
 */
export function matchesNegotiation(
  negotiation: Negotiation,
  record: { client: string; owner?: string; negotiationId?: string },
) {
  if (record.negotiationId) {
    return record.negotiationId === negotiation.id;
  }
  const sameClient = normalizeKey(record.client) === normalizeKey(negotiation.client);
  if (!sameClient) return false;
  // Sem responsável no registro (ex.: entrega) o cliente já basta para o vínculo.
  if (!record.owner) return true;
  return normalizeKey(record.owner) === normalizeKey(negotiation.owner);
}

export function getNegotiationLinkedRecords({
  negotiation,
  simulations,
  orders,
  deliveries,
}: {
  negotiation: Negotiation;
  simulations: Simulation[];
  orders: Order[];
  deliveries: DeliveryRecord[];
}): NegotiationLinkedRecords {
  const linkedSimulations = simulations.filter((simulation) =>
    matchesNegotiation(negotiation, simulation),
  );
  const linkedOrders = orders.filter((order) => matchesNegotiation(negotiation, order));
  const linkedOrderIds = new Set(linkedOrders.map((order) => order.id));
  const linkedDeliveries = deliveries.filter(
    (delivery) =>
      (delivery.orderId && linkedOrderIds.has(delivery.orderId)) ||
      matchesNegotiation(negotiation, delivery),
  );

  return {
    simulations: linkedSimulations,
    orders: linkedOrders,
    deliveries: linkedDeliveries,
  };
}

/**
 * Monta a linha do tempo unificada da jornada do negócio: simulação → aprovações →
 * conversão em pedido → faturamento → logística/entrega → resultado.
 * Reaproveita os eventos que os pedidos já carregam em `order.timeline`.
 */
export function buildNegotiationTimeline(linked: NegotiationLinkedRecords): OrderTimelineEvent[] {
  const events: OrderTimelineEvent[] = [];

  for (const simulation of linked.simulations) {
    events.push({
      id: `sim-created-${simulation.id}`,
      title: `Simulação ${simulation.number} criada`,
      description: `${simulation.status} • Responsável: ${simulation.owner}`,
      date: simulation.createdAt,
      completed: true,
    });

    const financial = simulation.approvalFlow?.financial;
    if (financial?.decidedAt) {
      events.push({
        id: `sim-fin-${simulation.id}`,
        title: `Aprovação financeira — ${simulation.number}`,
        description: describeApprovalStatus(financial.status, financial.approverName),
        date: financial.decidedAt,
        completed: financial.status === "approved",
      });
    }

    const principal = simulation.approvalFlow?.principal;
    if (principal?.decidedAt) {
      events.push({
        id: `sim-prin-${simulation.id}`,
        title: `Aprovação do gestor — ${simulation.number}`,
        description: describeApprovalStatus(principal.status, principal.approverName),
        date: principal.decidedAt,
        completed: principal.status === "approved",
      });
    }

    if (simulation.convertedAt) {
      events.push({
        id: `sim-converted-${simulation.id}`,
        title: `Simulação ${simulation.number} convertida em pedido`,
        description: "Oportunidade avançou para pedido.",
        date: simulation.convertedAt,
        completed: true,
      });
    }
  }

  for (const order of linked.orders) {
    for (const event of order.timeline) {
      events.push({
        ...event,
        id: `order-${order.id}-${event.id}`,
        title: `${event.title} — ${order.number}`,
      });
    }

    if (order.billedAt) {
      events.push({
        id: `order-billed-${order.id}`,
        title: `Faturamento concluído — ${order.number}`,
        description: order.invoiceNumber
          ? `NF ${order.invoiceNumber}`
          : "Faturamento registrado.",
        date: order.billedAt,
        completed: true,
      });
    }
  }

  for (const delivery of linked.deliveries) {
    if (delivery.deliveredAt) {
      events.push({
        id: `delivery-${delivery.id}`,
        title: `Entrega concluída${delivery.orderNumber ? ` — ${delivery.orderNumber}` : ""}`,
        description: delivery.route || "Entrega finalizada.",
        date: delivery.deliveredAt,
        completed: true,
      });
    }
  }

  return events.sort((first, second) => toTime(first.date) - toTime(second.date));
}

/** Atalho para o breakdown de produtos de um negócio (delega ao núcleo reutilizável). */
export function buildNegotiationProductBreakdown(
  linked: NegotiationLinkedRecords,
): NegotiationProductBreakdown[] {
  return buildProductBreakdown(linked);
}

/**
 * Agrega quantidade, receita, custo e margem por produto a partir de um conjunto de
 * simulações e pedidos. Núcleo compartilhado pelas lentes de Negócio, Cliente e Produto.
 */
export function buildProductBreakdown(records: {
  simulations: Simulation[];
  orders: Order[];
}): NegotiationProductBreakdown[] {
  const convertedSimulationIds = new Set(
    records.orders
      .map((order) => order.simulationId)
      .filter((id): id is string => Boolean(id)),
  );

  const sources: Array<{ product: SimulationProduct; source: NegotiationProductBreakdown["source"] }> =
    [];

  for (const order of records.orders) {
    for (const product of order.products) sources.push({ product, source: "pedido" });
  }
  for (const simulation of records.simulations) {
    // Evita contar duas vezes a simulação que já virou pedido.
    if (simulation.orderId || convertedSimulationIds.has(simulation.id)) continue;
    for (const product of simulation.products) sources.push({ product, source: "simulação" });
  }

  const byProduct = new Map<string, NegotiationProductBreakdown>();
  for (const { product, source } of sources) {
    const key = normalizeKey(product.code) || normalizeKey(product.product);
    const revenue = getProductSaleTotal(product);
    const cost = getProductCostTotal(product);
    const existing = byProduct.get(key);

    if (existing) {
      existing.quantity += product.quantityTotal;
      existing.revenue += revenue;
      existing.cost += cost;
    } else {
      byProduct.set(key, {
        code: product.code,
        product: product.product,
        quantity: product.quantityTotal,
        revenue,
        cost,
        profit: 0,
        marginPercent: 0,
        source,
      });
    }
  }

  return Array.from(byProduct.values())
    .map((item) => {
      const profit = item.revenue - item.cost;
      return {
        ...item,
        profit,
        marginPercent: item.revenue > 0 ? (profit / item.revenue) * 100 : 0,
      };
    })
    .sort((first, second) => second.revenue - first.revenue);
}

export function buildNegotiationMetrics({
  negotiation,
  linked,
  financialTitles,
  freights,
}: {
  negotiation: Negotiation;
  linked: NegotiationLinkedRecords;
  financialTitles: FinancialTitle[];
  freights: FreightRecord[];
}): NegotiationMetrics {
  const simulatedRevenue = linked.simulations.reduce(
    (sum, simulation) => sum + getSimulationTotals(simulation).revenue,
    0,
  );

  const linkedOrderIds = new Set(linked.orders.map((order) => order.id));
  const realizedResults = buildRealizedResults({
    orders: linked.orders,
    simulations: linked.simulations,
    financialTitles: financialTitles.filter(
      (title) => title.orderId && linkedOrderIds.has(title.orderId),
    ),
    freights: freights.filter((freight) => freight.orderId && linkedOrderIds.has(freight.orderId)),
    deliveries: linked.deliveries,
  });
  const summary = summarizeRealizedResults(realizedResults);

  const timeline = buildNegotiationTimeline(linked);
  const firstActivityAt = timeline[0]?.date ?? null;
  const lastActivityAt = timeline[timeline.length - 1]?.date ?? null;
  const cycleDays =
    firstActivityAt && lastActivityAt
      ? Math.max(0, Math.round((toTime(lastActivityAt) - toTime(firstActivityAt)) / 86_400_000))
      : null;

  return {
    expectedValue: negotiation.expectedValue,
    simulatedRevenue,
    realizedRevenue: summary.realizedRevenueTotal,
    receivableOpenTotal: summary.receivableOpenTotal,
    predictedMarginPercent: summary.averagePredictedMarginPercent,
    realizedMarginPercent: summary.averageRealizedMarginPercent,
    marginDeltaPercent:
      summary.averageRealizedMarginPercent - summary.averagePredictedMarginPercent,
    simulationCount: linked.simulations.length,
    orderCount: linked.orders.length,
    deliveryCount: linked.deliveries.length,
    conversionRate:
      linked.simulations.length > 0
        ? (linked.orders.length / linked.simulations.length) * 100
        : 0,
    cycleDays,
    firstActivityAt,
    lastActivityAt,
  };
}

function describeApprovalStatus(status: string, approverName?: string) {
  const label =
    status === "approved"
      ? "Aprovada"
      : status === "rejected"
        ? "Reprovada"
        : status === "adjustment_requested"
          ? "Ajuste solicitado"
          : "Pendente";
  return approverName ? `${label} por ${approverName}` : label;
}

function toTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export type InsightTone = "success" | "warning" | "danger" | "info";

/** Destaque de produto (ex.: mais vendido, maior margem) para os cards de insight. */
export interface NegotiationInsightHighlight {
  key: "topVolume" | "topRevenue" | "topMargin" | "topProfit";
  label: string;
  product: string;
  detail: string;
}

/** Alerta ou recomendação acionável para a próxima venda. */
export interface NegotiationAlert {
  key: string;
  tone: InsightTone;
  title: string;
  description: string;
}

export interface NegotiationInsights {
  highlights: NegotiationInsightHighlight[];
  alerts: NegotiationAlert[];
}

/** Métricas mínimas necessárias para derivar alertas — comum a Negócio e Cliente. */
export type InsightMetricsInput = Pick<
  NegotiationMetrics,
  | "realizedRevenue"
  | "marginDeltaPercent"
  | "realizedMarginPercent"
  | "predictedMarginPercent"
  | "receivableOpenTotal"
>;

/**
 * Deriva os insights de produto do negócio: destaques (mais vendido, maior receita,
 * maior margem, maior lucro) e alertas/recomendações para explorar a próxima venda.
 * Puro e reutilizável — servirá também às lentes de Cliente e Produto.
 */
export function buildNegotiationInsights({
  products,
  metrics,
}: {
  products: NegotiationProductBreakdown[];
  metrics: InsightMetricsInput;
}): NegotiationInsights {
  const highlights: NegotiationInsightHighlight[] = [];
  const alerts: NegotiationAlert[] = [];

  if (products.length > 0) {
    const topVolume = maxBy(products, (item) => item.quantity);
    const topRevenue = maxBy(products, (item) => item.revenue);
    const topProfit = maxBy(products, (item) => item.profit);
    // Margem só é relevante em produtos que efetivamente geraram receita.
    const withRevenue = products.filter((item) => item.revenue > 0);
    const topMargin = withRevenue.length ? maxBy(withRevenue, (item) => item.marginPercent) : null;

    if (topVolume) {
      highlights.push({
        key: "topVolume",
        label: "Mais vendido",
        product: topVolume.product,
        detail: `${topVolume.quantity.toLocaleString("pt-BR")} un`,
      });
    }
    if (topRevenue) {
      highlights.push({
        key: "topRevenue",
        label: "Maior receita",
        product: topRevenue.product,
        detail: formatCurrency(topRevenue.revenue),
      });
    }
    if (topMargin) {
      highlights.push({
        key: "topMargin",
        label: "Maior margem",
        product: topMargin.product,
        detail: formatPercent(topMargin.marginPercent, 1),
      });
    }
    if (topProfit) {
      highlights.push({
        key: "topProfit",
        label: "Maior lucro",
        product: topProfit.product,
        detail: formatCurrency(topProfit.profit),
      });
    }

    // Recomendação de âncora para a próxima proposta.
    if (topMargin && topMargin.marginPercent >= MINIMUM_MARGIN_TARGET) {
      alerts.push({
        key: "push-top-margin",
        tone: "success",
        title: `Priorize ${topMargin.product} na próxima proposta`,
        description: `É o produto de maior margem do negócio (${formatPercent(
          topMargin.marginPercent,
          1,
        )}). Bom candidato para ancorar preço e ganhar rentabilidade.`,
      });
    }

    // Produtos que puxam a margem para baixo.
    const lowMargin = products
      .filter((item) => item.revenue > 0 && item.marginPercent < MINIMUM_MARGIN_TARGET)
      .sort((first, second) => first.marginPercent - second.marginPercent);
    for (const item of lowMargin.slice(0, 3)) {
      alerts.push({
        key: `low-margin-${item.code}`,
        tone: item.marginPercent < ATTENTION_MARGIN_TARGET ? "danger" : "warning",
        title: `${item.product} está puxando a margem para baixo`,
        description: `Margem de ${formatPercent(item.marginPercent, 1)} (alvo ${formatPercent(
          MINIMUM_MARGIN_TARGET,
          1,
        )}). Renegocie preço ou fornecedor antes da próxima venda.`,
      });
    }
  }

  // Desvio da margem realizada frente à prevista.
  if (metrics.realizedRevenue > 0 && metrics.marginDeltaPercent < 0) {
    alerts.push({
      key: "margin-delta",
      tone: "warning",
      title: "Margem realizada abaixo da prevista",
      description: `Realizado ${formatPercent(metrics.realizedMarginPercent, 1)} vs. previsto ${formatPercent(
        metrics.predictedMarginPercent,
        1,
      )} (${formatPercent(metrics.marginDeltaPercent, 1)}). Revise custos e despesas do pedido.`,
    });
  }

  // Saldo em aberto a receber.
  if (metrics.receivableOpenTotal > 0) {
    alerts.push({
      key: "receivable-open",
      tone: "info",
      title: "Saldo a receber em aberto",
      description: `${formatCurrency(
        metrics.receivableOpenTotal,
      )} ainda não recebidos. Acompanhe o faturamento antes de liberar novas condições.`,
    });
  }

  return { highlights, alerts };
}

function maxBy<T>(items: T[], getter: (item: T) => number): T | null {
  if (items.length === 0) return null;
  return items.reduce((best, item) => (getter(item) > getter(best) ? item : best), items[0]);
}
