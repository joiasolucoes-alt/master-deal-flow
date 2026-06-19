import assert from "node:assert/strict";

const MINIMUM_MARGIN_TARGET = 3.5;
const ATTENTION_MARGIN_TARGET = 0;

function getExpenseTotal(expense, bases) {
  if (expense.calculationType === "fixed") return expense.value;
  const base =
    expense.type === "STRINT" ? "purchaseTotal" : (expense.calculationBase ?? "revenue");
  return bases[base] * (expense.value / 100);
}

function getProductSaleTotal(product) {
  return product.saleTotal ?? product.quantityTotal * product.saleUnit;
}

function getProductCostTotal(product) {
  return product.costTotal ?? product.quantityTotal * product.costUnit;
}

function getTotals({ products, purchaseItems = [], expenseItems }) {
  const revenue = products.reduce((sum, item) => sum + getProductSaleTotal(item), 0);
  const merchandiseCost = products.reduce((sum, item) => sum + getProductCostTotal(item), 0);
  const purchaseTotal = purchaseItems.length
    ? purchaseItems.reduce((sum, item) => sum + item.value, 0)
    : merchandiseCost;
  const grossProfit = revenue - merchandiseCost;
  const bases = { revenue, purchaseTotal, grossProfit };
  const expenses = expenseItems.reduce((sum, item) => sum + getExpenseTotal(item, bases), 0);
  const netProfit = grossProfit - expenses;
  const grossMarginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const markupPercent = merchandiseCost > 0 ? (revenue / merchandiseCost - 1) * 100 : 0;
  const marginPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  let viability = "Pendente";

  if (products.length > 0 && revenue > 0) {
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
  };
}

const smoke = getTotals({
  products: [{ quantityTotal: 20, costUnit: 70, saleUnit: 100 }],
  expenseItems: [{ calculationType: "fixed", value: 200 }],
});

assert.equal(smoke.merchandiseCost, 1400);
assert.equal(smoke.revenue, 2000);
assert.equal(smoke.grossProfit, 600);
assert.equal(smoke.netProfit, 400);
assert.equal(smoke.marginPercent, 20);

const manualTotals = getTotals({
  products: [{ quantityTotal: 10, costUnit: 1, costTotal: 25, saleUnit: 2, saleTotal: 40 }],
  expenseItems: [],
});

assert.equal(manualTotals.merchandiseCost, 25);
assert.equal(manualTotals.revenue, 40);
assert.equal(manualTotals.grossProfit, 15);

const op374 = getTotals({
  products: [
    { quantityTotal: 2430, costUnit: 15.59, saleUnit: 17.99 },
    { quantityTotal: 7650, costUnit: 14.02, saleUnit: 16.99 },
  ],
  purchaseItems: [{ value: 145136.7 }, { value: 5081.14 }],
  expenseItems: [
    { calculationType: "fixed", value: 5000 },
    { calculationType: "percentage", calculationBase: "revenue", value: 2.5 },
    { calculationType: "percentage", calculationBase: "purchaseTotal", value: 2 },
    { type: "STRINT", calculationType: "percentage", calculationBase: "revenue", value: 0.4 },
    { calculationType: "fixed", value: 2171.1008 },
    { calculationType: "percentage", calculationBase: "revenue", value: 1.4 },
    { calculationType: "fixed", value: 840 },
  ],
});

assert.equal(Math.round(op374.revenue * 100), 17368920);
assert.equal(Math.round(op374.merchandiseCost * 100), 14513670);
assert.equal(Math.round(op374.purchaseTotal * 100), 15021784);
assert.equal(Math.round(op374.grossProfit * 100), 2855250);
assert.equal(Math.round(op374.expenses * 100), 1839021);
assert.equal(Math.round(op374.netProfit * 100), 1016229);
assert.equal(Math.round(op374.grossMarginPercent * 100), 1644);
assert.equal(Math.round(op374.markupPercent * 100), 1967);
assert.equal(Math.round(op374.marginPercent * 100), 585);
assert.equal(op374.viability, "Viável");

console.log("Calculation smoke tests passed.");
