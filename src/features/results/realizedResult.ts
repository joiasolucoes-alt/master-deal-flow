import type {
  DeliveryRecord,
  FinancialTitle,
  FreightRecord,
  Order,
  RealizedResultRecord,
  Simulation,
} from "@/data/types";
import { getExpenseTotal, getSimulationTotals } from "@/lib/calculations";

const DEFAULT_COMMISSION_PERCENT = 2.5;

export interface RealizedFinancialEntry {
  id: string;
  titleNumber: string;
  description: string;
  amount: number;
  paidAmount: number;
  openAmount: number;
  dueDate: string;
  status: FinancialTitle["status"];
  bankName: string;
  proofFileName?: string;
  notes: string;
}

export interface RealizedExpenseEntry {
  id: string;
  name: string;
  calculation: string;
  plannedAmount: number;
}

export interface RealizedFreightEntry {
  id: string;
  code: string;
  carrier: string;
  route: string;
  contractedAmount: number;
  paidAmount: number;
  status: FreightRecord["status"];
}

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
  freightContractedTotal: number;
  freightPaidTotal: number;
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
  receivables: RealizedFinancialEntry[];
  payables: RealizedFinancialEntry[];
  expenses: RealizedExpenseEntry[];
  freightDetails: RealizedFreightEntry[];
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

export type OperationClosureStep = "Entrega" | "Financeiro" | "Comissão";

export interface OperationClosureState {
  isClosed: boolean;
  completedSteps: number;
  totalSteps: 3;
  progress: number;
  missingSteps: OperationClosureStep[];
}

export function getOperationClosureState(
  result: Pick<RealizedOrderResult, "deliveryCompleted" | "financialCompleted" | "commissionTotal">,
  closedResult?: Pick<RealizedResultRecord, "commissionPaymentStatus">,
): OperationClosureState {
  const steps = [
    { label: "Entrega" as const, completed: result.deliveryCompleted },
    { label: "Financeiro" as const, completed: result.financialCompleted },
    {
      label: "Comissão" as const,
      completed: result.commissionTotal <= 0 || closedResult?.commissionPaymentStatus === "paid",
    },
  ];
  const completedSteps = steps.filter((step) => step.completed).length;

  return {
    isClosed: completedSteps === steps.length,
    completedSteps,
    totalSteps: 3,
    progress: Math.round((completedSteps / steps.length) * 100),
    missingSteps: steps.filter((step) => !step.completed).map((step) => step.label),
  };
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

export function createClosedRealizedResultRecord(
  result: RealizedOrderResult,
  closedBy = "Sistema",
): RealizedResultRecord {
  const now = new Date().toISOString();
  return {
    id: `realized-${result.orderId}`,
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    client: result.client,
    owner: result.owner,
    unit: result.unit,
    status: "closed",
    orderTotal: result.orderTotal,
    realizedRevenueTotal: result.realizedRevenueTotal,
    receivableOpenTotal: result.receivableOpenTotal,
    costBookedTotal: result.costBookedTotal,
    costPaidTotal: result.costPaidTotal,
    commissionPercent: result.commissionPercent,
    commissionTotal: result.commissionTotal,
    realizedProfit: result.realizedProfit,
    projectedNetResult: result.projectedNetResult,
    predictedMarginPercent: result.predictedMarginPercent,
    realizedMarginPercent: result.realizedMarginPercent,
    marginDeltaPercent: result.marginDeltaPercent,
    billingProgress: result.billingProgress,
    paymentProgress: result.paymentProgress,
    deliveryCompleted: result.deliveryCompleted,
    financialCompleted: result.financialCompleted,
    commissionApprovalStatus: "pending",
    commissionApprovedBy: undefined,
    commissionApprovedAt: undefined,
    commissionNotes: "",
    commissionPaymentStatus: "pending",
    commissionPaidBy: undefined,
    commissionPaidAt: undefined,
    commissionPaymentNotes: "",
    closedAt: now,
    reopenedAt: undefined,
    reopenedBy: undefined,
    reopenReason: undefined,
    notes: `Fechamento registrado por ${closedBy}.`,
    createdAt: now,
    updatedAt: now,
  };
}

export function approveCommissionForRealizedResult(
  result: RealizedResultRecord,
  approvedBy = "Sistema",
): RealizedResultRecord {
  const now = new Date().toISOString();
  return {
    ...result,
    commissionApprovalStatus: "approved",
    commissionApprovedBy: approvedBy,
    commissionApprovedAt: now,
    commissionNotes: `Comissão aprovada por ${approvedBy}.`,
    updatedAt: now,
  };
}

export function payCommissionForRealizedResult(
  result: RealizedResultRecord,
  paidBy = "Sistema",
  notes = "",
): RealizedResultRecord {
  const now = new Date().toISOString();
  return {
    ...result,
    commissionPaymentStatus: "paid",
    commissionPaidBy: paidBy,
    commissionPaidAt: now,
    commissionPaymentNotes: notes || `Comissão paga por ${paidBy}.`,
    updatedAt: now,
  };
}

export function reopenRealizedResultRecord(
  result: RealizedResultRecord,
  reopenedBy = "Sistema",
  reason = "",
): RealizedResultRecord {
  const now = new Date().toISOString();
  const reopenText = reason || "Resultado reaberto para revisão.";
  return {
    ...result,
    status: "in_progress",
    commissionApprovalStatus: "pending",
    commissionApprovedBy: undefined,
    commissionApprovedAt: undefined,
    commissionNotes: "",
    commissionPaymentStatus: "blocked",
    commissionPaymentNotes: "Pagamento bloqueado por reabertura do resultado.",
    reopenedAt: now,
    reopenedBy,
    reopenReason: reopenText,
    notes: `${result.notes ? `${result.notes}\n` : ""}Reaberto por ${reopenedBy}: ${reopenText}`,
    updatedAt: now,
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
  const activeFinancialTitles = financialTitles.filter((title) => title.status !== "cancelled");
  const receivables = activeFinancialTitles.filter((title) => title.type === "receivable");
  const payables = activeFinancialTitles.filter((title) => title.type === "payable");
  const receivableAmount = receivables.length
    ? sumBy(receivables, (title) => title.amount)
    : order.totalValue;
  const realizedRevenueTotal = receivables.length
    ? sumBy(receivables, (title) => Math.min(title.paidAmount, title.amount))
    : roundCurrency((order.totalValue * order.billingProgress) / 100);
  const receivableOpenTotal = Math.max(0, receivableAmount - realizedRevenueTotal);
  const goodsCostTotal = getOrderGoodsCost(order);
  const freightCostTotal = sumBy(freights, (freight) => freight.freightValue);
  const freightPayables = payables.filter(isFreightPayableTitle);
  const freightPaidTotal = sumBy(freightPayables, (title) =>
    Math.min(title.paidAmount, title.amount),
  );
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
  const expenseBases = simulation
    ? (() => {
        const totals = getSimulationTotals(simulation);
        return {
          revenue: totals.revenue,
          purchaseTotal: totals.purchaseTotal,
          grossProfit: totals.grossProfit,
        };
      })()
    : undefined;

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
    freightContractedTotal: roundCurrency(freightCostTotal),
    freightPaidTotal: roundCurrency(freightPaidTotal),
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
    receivables: receivables.map(toFinancialEntry),
    payables: payables.map(toFinancialEntry),
    expenses:
      simulation && expenseBases
        ? simulation.expenseItems.map((expense) => ({
            id: expense.id,
            name: expense.type,
            calculation:
              expense.calculationType === "percentage"
                ? `${expense.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
                : "Valor fixo",
            plannedAmount: roundCurrency(getExpenseTotal(expense, expenseBases)),
          }))
        : [],
    freightDetails: freights.map((freight) => ({
      id: freight.id,
      code: freight.code,
      carrier: freight.carrierName || "Transportadora a definir",
      route: freight.route,
      contractedAmount: roundCurrency(freight.freightValue),
      paidAmount: roundCurrency(getFreightPaidAmount(freight, freightPayables)),
      status: freight.status,
    })),
  };
}

function toFinancialEntry(title: FinancialTitle): RealizedFinancialEntry {
  const paidAmount = Math.min(title.paidAmount, title.amount);
  return {
    id: title.id,
    titleNumber: title.titleNumber,
    description: title.client || title.notes || "Lançamento financeiro",
    amount: roundCurrency(title.amount),
    paidAmount: roundCurrency(paidAmount),
    openAmount: roundCurrency(Math.max(0, title.amount - paidAmount)),
    dueDate: title.dueDate,
    status: title.status,
    bankName: title.bankName,
    proofFileName: title.proofFileName,
    notes: title.notes,
  };
}

function isFreightPayableTitle(title: FinancialTitle) {
  return (
    title.id.startsWith("pay-freight-") ||
    title.titleNumber.toUpperCase().endsWith("-PAG-FRETE") ||
    title.notes.toLocaleLowerCase("pt-BR").startsWith("frete ")
  );
}

function getFreightPaidAmount(freight: FreightRecord, titles: FinancialTitle[]) {
  const linkedTitle = titles.find(
    (title) => title.id.includes(freight.id) || title.notes.includes(freight.code),
  );
  return linkedTitle ? Math.min(linkedTitle.paidAmount, linkedTitle.amount) : 0;
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
