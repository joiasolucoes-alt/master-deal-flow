import type {
  DeliveryRecord,
  FinancialTitle,
  FreightRecord,
  Order,
  Simulation,
} from "@/data/types";
import { getSimulationTotals } from "@/lib/calculations";

const DEFAULT_COMMISSION_PERCENT = 2.5;

export interface RealizedOrderResult {
  orderId: string;
  orderNumber: string;
  client: string;
  owner: string;
  unit: string;
  status: string;
  orderTotal: number;
  realizedRevenueTotal: number;
  receivableOpenTotal: number;
  costBookedTotal: number;
  costPaidTotal: number;
  commissionPercent: number;
  commissionTotal: number;
  realizedProfit: number;
  projectedNetResult: number;
  predictedMarginPercent: number;
  realizedMarginPercent: number;
  marginDeltaPercent: number;
  billingProgress: number;
  paymentProgress: number;
  deliveryCompleted: boolean;
  financialCompleted: boolean;
  closingStatus: "Em andamento" | "Em fechamento" | "Concluído";
}

export interface RealizedResultSummary {
  orderTotal: number;
  realizedRevenueTotal: number;
  receivableOpenTotal: number;
  costPaidTotal: number;
  commissionTotal: number;
  realizedProfit: number;
  averagePredictedMarginPercent: number;
  averageRealizedMarginPercent: number;
  completedOrders: number;
}

export function buildRealizedResults({
  orders,
  simulations,
  financialTitles,
  freights,
  deliveries,
}: {
  orders: Order[];
  simulations: Simulation[];
  financialTitles: FinancialTitle[];
  freights: FreightRecord[];
  deliveries: DeliveryRecord[];
}) {
  return orders.map((order) =>
    buildRealizedResult({
      order,
      simulation: simulations.find((simulation) => simulation.id === order.simulationId),
      financialTitles: financialTitles.filter((title) => title.orderId === order.id),
      freights: freights.filter((freight) => freight.orderId === order.id),
      deliveries: deliveries.filter((delivery) => delivery.orderId === order.id),
    }),
  );
}

export function summarizeRealizedResults(results: RealizedOrderResult[]): RealizedResultSummary {
  const realizedRevenueTotal = sumBy(results, (result) => result.realizedRevenueTotal);
  const realizedProfit = sumBy(results, (result) => result.realizedProfit);
  const weightedPredictedMargin = weightedAverage(results, "predictedMarginPercent", "orderTotal");
  const averageRealizedMarginPercent =
    realizedRevenueTotal > 0 ? (realizedProfit / realizedRevenueTotal) * 100 : 0;

  return {
    orderTotal: sumBy(results, (result) => result.orderTotal),
    realizedRevenueTotal,
    receivableOpenTotal: sumBy(results, (result) => result.receivableOpenTotal),
    costPaidTotal: sumBy(results, (result) => result.costPaidTotal),
    commissionTotal: sumBy(results, (result) => result.commissionTotal),
    realizedProfit,
    averagePredictedMarginPercent: weightedPredictedMargin,
    averageRealizedMarginPercent,
    completedOrders: results.filter((result) => result.closingStatus === "Concluído").length,
  };
}

function buildRealizedResult({
  order,
  simulation,
  financialTitles,
  freights,
  deliveries,
}: {
  order: Order;
  simulation?: Simulation;
  financialTitles: FinancialTitle[];
  freights: FreightRecord[];
  deliveries: DeliveryRecord[];
}): RealizedOrderResult {
  const receivables = financialTitles.filter((title) => title.type === "receivable");
  const payables = financialTitles.filter((title) => title.type === "payable");
  const receivableAmount = receivables.length
    ? sumBy(receivables, (title) => title.amount)
    : order.totalValue;
  const realizedRevenueTotal = receivables.length
    ? sumBy(receivables, (title) => Math.min(title.paidAmount, title.amount))
    : roundCurrency((order.totalValue * order.billingProgress) / 100);
  const receivableOpenTotal = Math.max(0, receivableAmount - realizedRevenueTotal);
  const goodsCostTotal = getOrderGoodsCost(order);
  const freightCostTotal = sumBy(freights, (freight) => freight.freightValue);
  const payableBookedTotal = sumBy(payables, (title) => title.amount);
  const costBookedTotal =
    payableBookedTotal > 0 ? payableBookedTotal : goodsCostTotal + freightCostTotal;
  const costPaidTotal = sumBy(payables, (title) => Math.min(title.paidAmount, title.amount));
  const commissionPercent = getCommissionPercent(simulation);
  const commissionTotal = roundCurrency(realizedRevenueTotal * (commissionPercent / 100));
  const realizedProfit = roundCurrency(realizedRevenueTotal - costPaidTotal - commissionTotal);
  const projectedCommission = roundCurrency(order.totalValue * (commissionPercent / 100));
  const projectedNetResult = roundCurrency(
    order.totalValue - costBookedTotal - projectedCommission,
  );
  const predictedMarginPercent = getPredictedMarginPercent({
    order,
    simulation,
    costBookedTotal,
    projectedCommission,
  });
  const realizedMarginPercent =
    realizedRevenueTotal > 0 ? (realizedProfit / realizedRevenueTotal) * 100 : 0;
  const billingProgress =
    receivableAmount > 0 ? (realizedRevenueTotal / receivableAmount) * 100 : 0;
  const paymentProgress =
    costBookedTotal > 0 ? (Math.min(costPaidTotal, costBookedTotal) / costBookedTotal) * 100 : 0;
  const deliveryCompleted =
    order.status === "Entregue" || deliveries.some((delivery) => delivery.status === "delivered");
  const financialCompleted = billingProgress >= 99.99 && paymentProgress >= 99.99;

  return {
    orderId: order.id,
    orderNumber: order.number,
    client: order.client,
    owner: order.owner,
    unit: order.unit,
    status: order.status,
    orderTotal: order.totalValue,
    realizedRevenueTotal: roundCurrency(realizedRevenueTotal),
    receivableOpenTotal: roundCurrency(receivableOpenTotal),
    costBookedTotal: roundCurrency(costBookedTotal),
    costPaidTotal: roundCurrency(costPaidTotal),
    commissionPercent,
    commissionTotal,
    realizedProfit,
    projectedNetResult,
    predictedMarginPercent,
    realizedMarginPercent,
    marginDeltaPercent: realizedMarginPercent - predictedMarginPercent,
    billingProgress: Math.min(100, billingProgress),
    paymentProgress: Math.min(100, paymentProgress),
    deliveryCompleted,
    financialCompleted,
    closingStatus: getClosingStatus({
      deliveryCompleted,
      financialCompleted,
      realizedRevenueTotal,
    }),
  };
}

function getPredictedMarginPercent({
  order,
  simulation,
  costBookedTotal,
  projectedCommission,
}: {
  order: Order;
  simulation?: Simulation;
  costBookedTotal: number;
  projectedCommission: number;
}) {
  if (simulation) return getSimulationTotals(simulation).marginPercent;
  if (order.totalValue <= 0) return 0;
  return ((order.totalValue - costBookedTotal - projectedCommission) / order.totalValue) * 100;
}

function getCommissionPercent(simulation?: Simulation) {
  const commission = simulation?.expenseItems.find((expense) => expense.type === "Comissão");
  if (!commission) return DEFAULT_COMMISSION_PERCENT;
  if (commission.calculationType === "percentage") return commission.value;
  const revenue = simulation ? getSimulationTotals(simulation).revenue : 0;
  return revenue > 0 ? (commission.value / revenue) * 100 : DEFAULT_COMMISSION_PERCENT;
}

function getOrderGoodsCost(order: Order) {
  return roundCurrency(
    order.products.reduce((sum, product) => {
      const costTotal = product.costTotal ?? product.quantityTotal * product.costUnit;
      return sum + costTotal;
    }, 0),
  );
}

function getClosingStatus({
  deliveryCompleted,
  financialCompleted,
  realizedRevenueTotal,
}: {
  deliveryCompleted: boolean;
  financialCompleted: boolean;
  realizedRevenueTotal: number;
}) {
  if (deliveryCompleted && financialCompleted) return "Concluído";
  if (deliveryCompleted || realizedRevenueTotal > 0) return "Em fechamento";
  return "Em andamento";
}

function weightedAverage<T>(items: T[], valueKey: keyof T, weightKey: keyof T) {
  const weightTotal = sumBy(items, (item) => Number(item[weightKey]));
  if (weightTotal <= 0) return 0;
  return sumBy(items, (item) => Number(item[valueKey]) * Number(item[weightKey])) / weightTotal;
}

function sumBy<T>(items: T[], getter: (item: T) => number) {
  return items.reduce((sum, item) => sum + getter(item), 0);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
