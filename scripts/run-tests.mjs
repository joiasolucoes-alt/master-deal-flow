import assert from "node:assert/strict";

const product = { quantityTotal: 20, costUnit: 70, saleUnit: 100 };
const expenses = [{ calculationType: "fixed", value: 200 }];
const revenue = product.quantityTotal * product.saleUnit;
const merchandiseCost = product.quantityTotal * product.costUnit;
const grossProfit = revenue - merchandiseCost;
const expenseTotal = expenses.reduce((sum, item) => sum + item.value, 0);
const netProfit = grossProfit - expenseTotal;
const marginPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;
const viability = marginPercent >= 12 ? "Viável" : marginPercent >= 8 ? "Atenção" : "Inviável";

assert.equal(product.quantityTotal, 20);
assert.equal(merchandiseCost, 1400);
assert.equal(revenue, 2000);
assert.equal(grossProfit, 600);
assert.equal(netProfit, 400);
assert.equal(marginPercent, 20);
assert.equal(viability, "Viável");

console.log("Calculation smoke tests passed.");
