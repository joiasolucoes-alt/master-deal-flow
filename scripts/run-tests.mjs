import assert from "node:assert/strict";

const MINIMUM_MARGIN_TARGET = 3.5;
const ATTENTION_MARGIN_TARGET = 0;
const VALID_DATA_PROVIDERS = new Set(["local", "supabase"]);

function getExpenseTotal(expense, bases) {
  if (expense.calculationType === "fixed") return expense.value;
  const base = expense.type === "STRINT" ? "purchaseTotal" : (expense.calculationBase ?? "revenue");
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

function getDataProvider(envValue) {
  return VALID_DATA_PROVIDERS.has(envValue) ? envValue : "local";
}

function createOrderRepository({ orders }) {
  return {
    async findBySimulationId(simulationId) {
      return orders.find((order) => order.simulationId === simulationId) ?? null;
    },
    async save(order) {
      const existing = order.simulationId
        ? (orders.find((item) => item.simulationId === order.simulationId) ?? null)
        : null;

      if (existing && existing.id !== order.id) {
        throw new Error(`Simulação já convertida no pedido ${existing.number}.`);
      }

      orders.unshift(order);
      return order;
    },
  };
}

function createCatalogRepository(seed = []) {
  const records = [...seed];
  return {
    list() {
      return records;
    },
    save(record) {
      const index = records.findIndex((item) => item.id === record.id);
      if (index >= 0) records[index] = record;
      else records.unshift(record);
      return record;
    },
    deactivate(id) {
      const record = records.find((item) => item.id === id);
      if (!record) return null;
      record.active = false;
      return record;
    },
  };
}

function parseInstallmentDays(paymentTerms) {
  const days = paymentTerms
    .match(/\d+/g)
    ?.map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);
  return days?.length ? days : [28];
}

function createFinancialTitlesFromOrder(order) {
  const days = parseInstallmentDays(order.paymentTerms);
  const amount = Math.round((order.totalValue / days.length) * 100) / 100;
  return days.map((day, index) => ({
    id: `fin-${order.id}-${index + 1}`,
    orderId: order.id,
    titleNumber: `${order.number}-PARC-${index + 1}`,
    type: "receivable",
    status: "open",
    dueDate: day,
    amount: index === days.length - 1 ? order.totalValue - amount * index : amount,
    paidAmount: 0,
  }));
}

function calculateBillingProgress(titles) {
  const total = titles.reduce((sum, title) => sum + title.amount, 0);
  const paid = titles.reduce((sum, title) => sum + Math.min(title.paidAmount, title.amount), 0);
  return total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
}

function transitionSimulation(simulation, status, extra = {}) {
  return { ...simulation, status, ...extra };
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

const draftSimulation = {
  id: "sim-test",
  products: [{ quantityTotal: 20, costUnit: 70, saleUnit: 100 }],
  expenseItems: [{ calculationType: "fixed", value: 200 }],
  status: "Rascunho",
};
const submittedSimulation = transitionSimulation(draftSimulation, "Pendente de aprovação");
assert.equal(submittedSimulation.status, "Pendente de aprovação");
const approvedSimulation = transitionSimulation(submittedSimulation, "Aprovada", {
  approvalChecklist: { assumptionsReviewed: true, marginValidated: true, costsChecked: true },
  approvalNotes: "Aprovado em teste.",
});
assert.equal(approvedSimulation.status, "Aprovada");
assert.equal(approvedSimulation.approvalChecklist.costsChecked, true);
assert.equal(
  transitionSimulation(submittedSimulation, "Ajuste solicitado").status,
  "Ajuste solicitado",
);
assert.equal(transitionSimulation(submittedSimulation, "Reprovada").status, "Reprovada");

assert.equal(getDataProvider("supabase"), "supabase");
assert.equal(getDataProvider("local"), "local");
assert.equal(getDataProvider("qualquer-coisa"), "local");
assert.equal(getDataProvider(undefined), "local");

const orderRepository = createOrderRepository({
  orders: [{ id: "ord-1", number: "PED 1", simulationId: "sim-1" }],
});

await assert.rejects(
  () => orderRepository.save({ id: "ord-2", number: "PED 2", simulationId: "sim-1" }),
  /Simulação já convertida/,
);

const savedOrder = await orderRepository.save({
  id: "ord-1",
  number: "PED 1",
  simulationId: "sim-1",
});
assert.equal(savedOrder.id, "ord-1");

const clientRepository = createCatalogRepository([
  { id: "cli-1", name: "Cliente A", active: true },
]);
clientRepository.save({ id: "cli-2", name: "Cliente B", active: true });
assert.equal(clientRepository.list().length, 2);
clientRepository.save({ id: "cli-2", name: "Cliente B editado", active: true });
assert.equal(clientRepository.list().find((item) => item.id === "cli-2").name, "Cliente B editado");
assert.equal(clientRepository.deactivate("cli-2").active, false);

const supplierRepository = createCatalogRepository();
supplierRepository.save({ id: "sup-1", name: "Fornecedor A", active: true });
assert.equal(supplierRepository.list()[0].name, "Fornecedor A");

const productRepository = createCatalogRepository();
productRepository.save({
  id: "prod-1",
  code: "PRD-001",
  name: "Produto A",
  defaultUnitsPerBox: 9,
  costUnit: 10,
  saleUnit: 12,
  active: true,
});
assert.equal(productRepository.list()[0].defaultUnitsPerBox, 9);

assert.deepEqual(parseInstallmentDays("7 e 14 dias"), [7, 14]);
assert.deepEqual(parseInstallmentDays("à vista"), [28]);

const financialTitles = createFinancialTitlesFromOrder({
  id: "ord-fin-1",
  number: "PED FIN 1",
  totalValue: 1000,
  paymentTerms: "7 e 14 dias",
});
assert.equal(financialTitles.length, 2);
assert.equal(financialTitles[0].amount, 500);
assert.equal(financialTitles[1].titleNumber, "PED FIN 1-PARC-2");
assert.equal(calculateBillingProgress(financialTitles), 0);
assert.equal(
  calculateBillingProgress([
    { amount: 500, paidAmount: 500 },
    { amount: 500, paidAmount: 0 },
  ]),
  50,
);
assert.equal(
  calculateBillingProgress([
    { amount: 500, paidAmount: 500 },
    { amount: 500, paidAmount: 500 },
  ]),
  100,
);

function requireSupabaseConfig(configured) {
  if (!configured) throw new Error("Supabase não está configurado.");
  return true;
}
assert.throws(() => requireSupabaseConfig(false), /Supabase não está configurado/);
assert.equal(requireSupabaseConfig(true), true);

console.log("Calculation and data provider smoke tests passed.");
