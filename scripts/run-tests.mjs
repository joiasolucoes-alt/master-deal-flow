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

function createFreightFromOrder(order) {
  return {
    id: `freight-${order.id}`,
    orderId: order.id,
    orderNumber: order.number,
    status:
      order.status === "Em rota"
        ? "in_route"
        : order.status === "Entregue"
          ? "delivered"
          : "quoted",
    route: `${order.origin} → ${order.destination}`,
    owner: order.owner,
  };
}

function getNextFreightStatus(status) {
  return {
    quoted: "hired",
    hired: "loading",
    loading: "in_route",
    in_route: "delivered",
    delivered: "delivered",
    cancelled: "cancelled",
  }[status];
}

function updateOrderFromFreight(order, freight) {
  const progressByStatus = {
    quoted: 0,
    hired: 15,
    loading: 35,
    in_route: 70,
    delivered: 100,
    cancelled: 0,
  };
  return {
    ...order,
    status:
      freight.status === "delivered"
        ? "Entregue"
        : freight.status === "in_route"
          ? "Em rota"
          : order.status,
    deliveryProgress: Math.max(order.deliveryProgress, progressByStatus[freight.status]),
  };
}

function createDeliveryFromFreight(freight) {
  return {
    id: `delivery-${freight.id}`,
    orderId: freight.orderId,
    freightId: freight.id,
    status:
      freight.status === "in_route"
        ? "in_route"
        : freight.status === "delivered"
          ? "delivered"
          : "pending",
    currentLocation: freight.status === "in_route" ? "Em trânsito" : "Aguardando expedição",
    occurrenceNotes: "",
  };
}

function getNextDeliveryStatus(status) {
  return {
    pending: "loading",
    loading: "loaded",
    loaded: "in_route",
    in_route: "arrived",
    arrived: "delivered",
    delivered: "delivered",
    issue: "in_route",
    cancelled: "cancelled",
  }[status];
}

function updateOrderFromDelivery(order, delivery) {
  const progressByStatus = {
    pending: 0,
    loading: 25,
    loaded: 45,
    in_route: 70,
    arrived: 90,
    delivered: 100,
    issue: 70,
    cancelled: 0,
  };
  return {
    ...order,
    status:
      delivery.status === "delivered"
        ? "Entregue"
        : ["in_route", "arrived", "issue"].includes(delivery.status)
          ? "Em rota"
          : order.status,
    deliveryProgress: Math.max(order.deliveryProgress, progressByStatus[delivery.status]),
  };
}

function transitionSimulation(simulation, status, extra = {}) {
  return { ...simulation, status, ...extra };
}

function getApprovalFlow(simulation) {
  const inferredApproved = simulation.status === "Aprovada";
  return {
    financial: {
      status: inferredApproved ? "approved" : "pending",
      ...(simulation.approvalFlow?.financial ?? {}),
    },
    principal: {
      status: inferredApproved ? "approved" : "pending",
      ...(simulation.approvalFlow?.principal ?? {}),
    },
  };
}

function getCurrentApprovalStage(simulation) {
  if (!["Pendente de aprovação", "Em análise"].includes(simulation.status)) return null;
  const flow = getApprovalFlow(simulation);
  if (flow.financial.status === "pending") return "financial";
  if (flow.financial.status === "approved" && flow.principal.status === "pending") {
    return "principal";
  }
  return null;
}

function isSimulationFullyApproved(simulation) {
  const flow = getApprovalFlow(simulation);
  return flow.financial.status === "approved" && flow.principal.status === "approved";
}

function applyApprovalDecision(simulation, stage, status) {
  const flow = getApprovalFlow(simulation);
  const nextFlow = { ...flow, [stage]: { ...flow[stage], status } };
  if (status === "adjustment_requested") {
    return { ...simulation, status: "Ajuste solicitado", approvalFlow: nextFlow };
  }
  if (status === "rejected") {
    return { ...simulation, status: "Reprovada", approvalFlow: nextFlow };
  }
  return {
    ...simulation,
    status:
      nextFlow.financial.status === "approved" && nextFlow.principal.status === "approved"
        ? "Aprovada"
        : "Pendente de aprovação",
    approvalFlow: nextFlow,
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

const twoStepSubmitted = transitionSimulation(draftSimulation, "Pendente de aprovação", {
  approvalFlow: {
    financial: { status: "pending" },
    principal: { status: "pending" },
  },
});
assert.equal(getCurrentApprovalStage(twoStepSubmitted), "financial");
assert.equal(isSimulationFullyApproved(twoStepSubmitted), false);

const financialApproved = applyApprovalDecision(twoStepSubmitted, "financial", "approved");
assert.equal(financialApproved.status, "Pendente de aprovação");
assert.equal(getCurrentApprovalStage(financialApproved), "principal");
assert.equal(isSimulationFullyApproved(financialApproved), false);

const principalApproved = applyApprovalDecision(financialApproved, "principal", "approved");
assert.equal(principalApproved.status, "Aprovada");
assert.equal(isSimulationFullyApproved(principalApproved), true);

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

const freightOrder = {
  id: "ord-freight-1",
  number: "PED FRETE 1",
  origin: "Cataguases • MG",
  destination: "Juiz de Fora • MG",
  owner: "Djalma",
  status: "Em separação",
  deliveryProgress: 0,
};
const freight = createFreightFromOrder(freightOrder);
assert.equal(freight.id, "freight-ord-freight-1");
assert.equal(freight.route, "Cataguases • MG → Juiz de Fora • MG");
assert.equal(getNextFreightStatus("quoted"), "hired");
assert.equal(getNextFreightStatus("loading"), "in_route");
const inRouteOrder = updateOrderFromFreight(freightOrder, { ...freight, status: "in_route" });
assert.equal(inRouteOrder.status, "Em rota");
assert.equal(inRouteOrder.deliveryProgress, 70);
const deliveredOrder = updateOrderFromFreight(inRouteOrder, { ...freight, status: "delivered" });
assert.equal(deliveredOrder.status, "Entregue");
assert.equal(deliveredOrder.deliveryProgress, 100);

const delivery = createDeliveryFromFreight({ ...freight, status: "in_route" });
assert.equal(delivery.id, "delivery-freight-ord-freight-1");
assert.equal(delivery.status, "in_route");
assert.equal(getNextDeliveryStatus("pending"), "loading");
assert.equal(getNextDeliveryStatus("arrived"), "delivered");
const arrivedOrder = updateOrderFromDelivery(freightOrder, { ...delivery, status: "arrived" });
assert.equal(arrivedOrder.status, "Em rota");
assert.equal(arrivedOrder.deliveryProgress, 90);
const issueOrder = updateOrderFromDelivery(freightOrder, {
  ...delivery,
  status: "issue",
  occurrenceNotes: "Cliente ausente.",
});
assert.equal(issueOrder.status, "Em rota");
assert.equal(issueOrder.deliveryProgress, 70);

function requireSupabaseConfig(configured) {
  if (!configured) throw new Error("Supabase não está configurado.");
  return true;
}
assert.throws(() => requireSupabaseConfig(false), /Supabase não está configurado/);
assert.equal(requireSupabaseConfig(true), true);

console.log("Calculation and data provider smoke tests passed.");

const DRIVER_EVENT_FLOW = ["arrived_pickup", "loaded", "in_transit", "delivered", "proof_uploaded"];
function getNextDriverEventForTest(events, requiresProof = true, linkState = "active") {
  if (linkState !== "active") return null;
  const completed = new Set(events);
  return (
    DRIVER_EVENT_FLOW.find(
      (event) => (event !== "proof_uploaded" || requiresProof) && !completed.has(event),
    ) ?? null
  );
}
function isDriverEventInOrder(events, eventType) {
  return getNextDriverEventForTest(events) === eventType;
}
assert.equal(getNextDriverEventForTest([]), "arrived_pickup");
assert.equal(isDriverEventInOrder([], "loaded"), false);
assert.equal(isDriverEventInOrder(["arrived_pickup"], "loaded"), true);
assert.equal(isDriverEventInOrder(["arrived_pickup", "loaded"], "delivered"), false);
assert.equal(
  getNextDriverEventForTest(["arrived_pickup", "loaded", "in_transit", "delivered"], false),
  null,
);
assert.equal(getNextDriverEventForTest(["arrived_pickup"], true, "revoked"), null);

console.log("Todos os testes passaram.");
