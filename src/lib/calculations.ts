import { ATTENTION_MARGIN_TARGET, MINIMUM_MARGIN_TARGET } from "@/lib/constants";
import type {
  ExpenseItem,
  PurchaseItem,
  Simulation,
  SimulationProduct,
  Viability,
} from "@/data/types";

export interface SimulationTotals {
  revenue: number;
  merchandiseCost: number;
  purchaseTotal: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
  viability: Viability;
  differenceToTarget: number;
}

export function getProductSaleTotal(product: SimulationProduct) {
  return product.quantityTotal * product.saleUnit;
}

export function getProductCostTotal(product: SimulationProduct) {
  return product.quantityTotal * product.costUnit;
}

export function getExpenseTotal(expense: ExpenseItem, revenue: number) {
  return expense.calculationType === "percentage" ? revenue * (expense.value / 100) : expense.value;
}

export function getPurchaseShare(item: PurchaseItem, total: number) {
  if (total <= 0) return 0;
  return (item.value / total) * 100;
}

export function getSimulationTotals(
  simulation: Pick<Simulation, "products" | "expenseItems">,
): SimulationTotals {
  const revenue = simulation.products.reduce((sum, item) => sum + getProductSaleTotal(item), 0);
  const merchandiseCost = simulation.products.reduce(
    (sum, item) => sum + getProductCostTotal(item),
    0,
  );
  const expenses = simulation.expenseItems.reduce(
    (sum, item) => sum + getExpenseTotal(item, revenue),
    0,
  );
  const grossProfit = revenue - merchandiseCost;
  const netProfit = grossProfit - expenses;
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
    purchaseTotal: merchandiseCost,
    expenses,
    grossProfit,
    netProfit,
    marginPercent,
    viability,
    differenceToTarget,
  };
}

export function getSimulationCostImpact(simulation: Pick<Simulation, "expenseItems" | "products">) {
  const totals = getSimulationTotals(simulation);
  const totalExpenses = totals.expenses || 1;
  return simulation.expenseItems.map((item) => ({
    name: item.type,
    value: getExpenseTotal(item, totals.revenue),
    percent: (getExpenseTotal(item, totals.revenue) / totalExpenses) * 100,
  }));
}

export function getSimulationSensitivity(
  simulation: Pick<Simulation, "products" | "expenseItems">,
) {
  const base = getSimulationTotals(simulation);
  const freightAdjusted = getSimulationTotals({
    products: simulation.products,
    expenseItems: simulation.expenseItems.map((item) =>
      item.type === "Frete" ? { ...item, value: item.value * 1.1 } : item,
    ),
  });
  const reducedPrice = getSimulationTotals({
    products: simulation.products.map((item) => ({ ...item, saleUnit: item.saleUnit * 0.97 })),
    expenseItems: simulation.expenseItems,
  });

  return [
    { name: "Cenário base", margin: base.marginPercent },
    { name: "Frete +10%", margin: freightAdjusted.marginPercent },
    { name: "Preço -3%", margin: reducedPrice.marginPercent },
  ];
}
