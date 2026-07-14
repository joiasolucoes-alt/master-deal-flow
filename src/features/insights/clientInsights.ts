import type {
  Client,
  DeliveryRecord,
  FinancialTitle,
  FreightRecord,
  Order,
  OrderTimelineEvent,
  Product,
  Simulation,
} from "@/data/types";
import { getSimulationTotals } from "@/lib/calculations";
import { buildRealizedResults, summarizeRealizedResults } from "@/features/results/realizedResult";
import {
  buildNegotiationInsights,
  buildNegotiationTimeline,
  buildProductBreakdown,
  type NegotiationInsights,
  type NegotiationProductBreakdown,
} from "./negotiationInsights";

/**
 * Lente de Cliente sobre a mesma base de dados. Reaproveita o núcleo de agregação
 * do módulo de Negócios (breakdown de produtos, timeline e insights), agora agrupando
 * por cliente — que, como definido com o gestor, é a chave central dos insights.
 *
 * O vínculo é por nome do cliente (o mesmo campo `client` usado em simulações e pedidos).
 */

export interface ClientRecords {
  simulations: Simulation[];
  orders: Order[];
  deliveries: DeliveryRecord[];
}

export interface ClientSummary {
  key: string;
  name: string;
  city?: string;
  state?: string;
  unit?: string;
  simulationCount: number;
  orderCount: number;
  productCount: number;
  simulatedRevenue: number;
  realizedRevenue: number;
  realizedMarginPercent: number;
  predictedMarginPercent: number;
  marginDeltaPercent: number;
  receivableOpenTotal: number;
  lastActivityAt: string | null;
}

export interface CrossSellSuggestion {
  code: string;
  product: string;
  marginPercent: number;
  reason: string;
}

export interface ClientInsight {
  summary: ClientSummary;
  timeline: OrderTimelineEvent[];
  products: NegotiationProductBreakdown[];
  insights: NegotiationInsights;
  crossSell: CrossSellSuggestion[];
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Chave estável de um cliente (usada como slug de rota). */
export function clientKey(name: string | null | undefined) {
  return normalizeKey(name);
}

/** Filtra simulações, pedidos e entregas de um cliente (por nome). */
export function getClientRecords({
  clientName,
  simulations,
  orders,
  deliveries,
}: {
  clientName: string;
  simulations: Simulation[];
  orders: Order[];
  deliveries: DeliveryRecord[];
}): ClientRecords {
  const key = normalizeKey(clientName);
  const clientSimulations = simulations.filter((item) => normalizeKey(item.client) === key);
  const clientOrders = orders.filter((item) => normalizeKey(item.client) === key);
  const orderIds = new Set(clientOrders.map((order) => order.id));
  const clientDeliveries = deliveries.filter(
    (delivery) =>
      (delivery.orderId && orderIds.has(delivery.orderId)) ||
      normalizeKey(delivery.client) === key,
  );

  return { simulations: clientSimulations, orders: clientOrders, deliveries: clientDeliveries };
}

function buildClientSummary({
  clientName,
  records,
  financialTitles,
  freights,
  catalogClient,
}: {
  clientName: string;
  records: ClientRecords;
  financialTitles: FinancialTitle[];
  freights: FreightRecord[];
  catalogClient?: Client;
}): ClientSummary {
  const orderIds = new Set(records.orders.map((order) => order.id));
  const realizedResults = buildRealizedResults({
    orders: records.orders,
    simulations: records.simulations,
    financialTitles: financialTitles.filter((title) => title.orderId && orderIds.has(title.orderId)),
    freights: freights.filter((freight) => freight.orderId && orderIds.has(freight.orderId)),
    deliveries: records.deliveries,
  });
  const summary = summarizeRealizedResults(realizedResults);
  const simulatedRevenue = records.simulations.reduce(
    (sum, simulation) => sum + getSimulationTotals(simulation).revenue,
    0,
  );
  const timeline = buildNegotiationTimeline(records);
  const products = buildProductBreakdown(records);

  return {
    key: normalizeKey(clientName),
    name: clientName,
    city: catalogClient?.city,
    state: catalogClient?.state,
    unit: catalogClient?.unit,
    simulationCount: records.simulations.length,
    orderCount: records.orders.length,
    productCount: products.length,
    simulatedRevenue,
    realizedRevenue: summary.realizedRevenueTotal,
    realizedMarginPercent: summary.averageRealizedMarginPercent,
    predictedMarginPercent: summary.averagePredictedMarginPercent,
    marginDeltaPercent:
      summary.averageRealizedMarginPercent - summary.averagePredictedMarginPercent,
    receivableOpenTotal: summary.receivableOpenTotal,
    lastActivityAt: timeline.length ? timeline[timeline.length - 1].date : null,
  };
}

/** Diretório de clientes com os agregados de cada um, para a lista. */
export function buildClientDirectory({
  clients,
  simulations,
  orders,
  deliveries,
  financialTitles,
  freights,
}: {
  clients: Client[];
  simulations: Simulation[];
  orders: Order[];
  deliveries: DeliveryRecord[];
  financialTitles: FinancialTitle[];
  freights: FreightRecord[];
}): ClientSummary[] {
  const catalogByKey = new Map(clients.map((client) => [normalizeKey(client.name), client]));

  // A fonte de verdade dos clientes "ativos" é a movimentação real (simulações/pedidos).
  const names = new Map<string, string>();
  for (const simulation of simulations) names.set(normalizeKey(simulation.client), simulation.client);
  for (const order of orders) names.set(normalizeKey(order.client), order.client);

  return Array.from(names.entries())
    .map(([key, clientName]) => {
      const records = getClientRecords({ clientName, simulations, orders, deliveries });
      return buildClientSummary({
        clientName,
        records,
        financialTitles,
        freights,
        catalogClient: catalogByKey.get(key),
      });
    })
    .sort((first, second) => second.realizedRevenue - first.realizedRevenue);
}

/** Sugestões de cross-sell: itens de boa margem do catálogo ainda não comprados. */
export function buildClientCrossSell({
  products,
  catalog,
  limit = 5,
}: {
  products: NegotiationProductBreakdown[];
  catalog: Product[];
  limit?: number;
}): CrossSellSuggestion[] {
  const purchased = new Set(products.map((item) => normalizeKey(item.code) || normalizeKey(item.product)));

  return catalog
    .filter((product) => product.active !== false)
    .map((product) => {
      const key = normalizeKey(product.code) || normalizeKey(product.name);
      const marginPercent =
        product.saleUnit > 0 ? ((product.saleUnit - product.costUnit) / product.saleUnit) * 100 : 0;
      return { key, product, marginPercent };
    })
    .filter((item) => !purchased.has(item.key))
    .sort((first, second) => second.marginPercent - first.marginPercent)
    .slice(0, limit)
    .map((item) => ({
      code: item.product.code,
      product: item.product.name,
      marginPercent: item.marginPercent,
      reason: "Alta margem no catálogo e ainda não comprado por este cliente.",
    }));
}

/** Monta a lente completa de um cliente: resumo, histórico, produtos, insights e cross-sell. */
export function buildClientInsight({
  clientName,
  simulations,
  orders,
  deliveries,
  financialTitles,
  freights,
  clients,
  catalog,
}: {
  clientName: string;
  simulations: Simulation[];
  orders: Order[];
  deliveries: DeliveryRecord[];
  financialTitles: FinancialTitle[];
  freights: FreightRecord[];
  clients: Client[];
  catalog: Product[];
}): ClientInsight {
  const records = getClientRecords({ clientName, simulations, orders, deliveries });
  const catalogClient = clients.find(
    (client) => normalizeKey(client.name) === normalizeKey(clientName),
  );
  const summary = buildClientSummary({
    clientName,
    records,
    financialTitles,
    freights,
    catalogClient,
  });
  const timeline = buildNegotiationTimeline(records);
  const products = buildProductBreakdown(records);
  const insights = buildNegotiationInsights({ products, metrics: summary });
  const crossSell = buildClientCrossSell({ products, catalog });

  return { summary, timeline, products, insights, crossSell };
}
