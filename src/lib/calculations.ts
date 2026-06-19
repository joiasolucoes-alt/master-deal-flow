import { ATTENTION_MARGIN_TARGET, MINIMUM_MARGIN_TARGET } from "@/lib/constants";
import type {
  ExpenseItem,
  PurchaseItem,
  Simulation,
  SimulationProduct,
  Viability,
} from "@/data/types";

type SimulationCalculationInput = Pick<Simulation, "products" | "expenseItems"> &
  Partial<Pick<Simulation, "purchaseItems">>;

interface ExpenseCalculationBases {
  revenue: number;
  purchaseTotal: number;
  grossProfit: number;
}

export interface SimulationTotals {
  revenue: number;
  merchandiseCost: number;
  purchaseTotal: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
  grossMarginPercent: number;
  markupPercent: number;
  marginPercent: number;
  viability: Viability;
  differenceToTarget: number;
}

export function getProductSaleTotal(product: SimulationProduct) {
  return product.saleTotal ?? product.quantityTotal * product.saleUnit;
}

export function getProductCostTotal(product: SimulationProduct) {
  return product.costTotal ?? product.quantityTotal * product.costUnit;
}

function getExpenseBaseValue(expense: ExpenseItem, bases: ExpenseCalculationBases) {
  const base = expense.calculationBase ?? "revenue";
  return bases[base];
}

export function getExpenseTotal(
  expense: ExpenseItem,
  basesOrRevenue: ExpenseCalculationBases | number,
) {
  if (expense.calculationType === "fixed") return expense.value;

  const baseValue =
    typeof basesOrRevenue === "number"
      ? basesOrRevenue
      : getExpenseBaseValue(expense, basesOrRevenue);

  return baseValue * (expense.value / 100);
}

export function getPurchaseShare(item: PurchaseItem, total: number) {
  if (total <= 0) return 0;
  return (item.value / total) * 100;
}

export function getSimulationTotals(simulation: SimulationCalculationInput): SimulationTotals {
  const revenue = simulation.products.reduce((sum, item) => sum + getProductSaleTotal(item), 0);
  const merchandiseCost = simulation.products.reduce(
    (sum, item) => sum + getProductCostTotal(item),
    0,
  );
  const purchaseTotal =
    simulation.purchaseItems && simulation.purchaseItems.length > 0
      ? simulation.purchaseItems.reduce((sum, item) => sum + item.value, 0)
      : merchandiseCost;
  const grossProfit = revenue - merchandiseCost;
  const bases = { revenue, purchaseTotal, grossProfit };
  const expenses = simulation.expenseItems.reduce(
    (sum, item) => sum + getExpenseTotal(item, bases),
    0,
  );
  const netProfit = grossProfit - expenses;
  const grossMarginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const markupPercent = merchandiseCost > 0 ? (revenue / merchandiseCost - 1) * 100 : 0;
  const marginPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const differenceToTarget = marginPercent - MINIMUM_MARGIN_TARGET;

  let viability: Viability = "Pendente";
  if (simulation.products.length > 0 && revenue > 0) {
    if (marginPercent >= MINIMUM_MARGIN_TARGET) viability = "Viável";
    else if (marginPercent >= ATTENTION_MARGIN_TARGET) viability = "Atenção";
    else viability = "Inviável";
  }

  return {
    revenue,
    merchandiseCost,
    purchaseTotal,
    expenses,
    grossProfit,
    netProfit,
    grossMarginPercent,
    markupPercent,
    marginPercent,
    viability,
    differenceToTarget,
  };
}

export function getSimulationCostImpact(simulation: SimulationCalculationInput) {
  const totals = getSimulationTotals(simulation);
  const totalExpenses = totals.expenses || 1;
  const bases = {
    revenue: totals.revenue,
    purchaseTotal: totals.purchaseTotal,
    grossProfit: totals.grossProfit,
  };
  return simulation.expenseItems.map((item) => ({
    name: item.type,
    value: getExpenseTotal(item, bases),
    percent: (getExpenseTotal(item, bases) / totalExpenses) * 100,
  }));
}

export function getSimulationSensitivity(simulation: SimulationCalculationInput) {
  const base = getSimulationTotals(simulation);
  const freightAdjusted = getSimulationTotals({
    products: simulation.products,
    purchaseItems: simulation.purchaseItems,
    expenseItems: simulation.expenseItems.map((item) =>
      item.type === "Frete" ? { ...item, value: item.value * 1.1 } : item,
    ),
  });
  const reducedPrice = getSimulationTotals({
    products: simulation.products.map((item) => ({ ...item, saleUnit: item.saleUnit * 0.97 })),
    purchaseItems: simulation.purchaseItems,
    expenseItems: simulation.expenseItems,
  });

  return [
    { name: "Cenário base", margin: base.marginPercent },
    { name: "Frete +10%", margin: freightAdjusted.marginPercent },
    { name: "Preço -3%", margin: reducedPrice.marginPercent },
  ];
}
