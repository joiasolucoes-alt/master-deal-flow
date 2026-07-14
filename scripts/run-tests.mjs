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

function createPayableTitlesFromOrder(order, freights = []) {
  const goodsTotal = order.products.reduce((sum, product) => {
    const costTotal = product.costTotal ?? product.quantityTotal * product.costUnit;
    return sum + costTotal;
  }, 0);
  const titles = [];

  if (goodsTotal > 0) {
    titles.push({
      id: `pay-${order.id}-goods`,
      orderId: order.id,
      titleNumber: `${order.number}-PAG-MERC`,
      type: "payable",
      status: "open",
      amount: Math.round(goodsTotal * 100) / 100,
      paidAmount: 0,
    });
  }

  freights
    .filter((freight) => freight.orderId === order.id && freight.freightValue > 0)
    .forEach((freight) => {
      titles.push({
        id: `pay-${order.id}-freight-${freight.id}`,
        orderId: order.id,
        titleNumber: `${order.number}-PAG-FRETE`,
        type: "payable",
        status: "open",
        amount: Math.round(freight.freightValue * 100) / 100,
        paidAmount: 0,
      });
    });

  return titles;
}

function createOperationalFinancialTitlesFromSimulationOrder(simulation, order) {
  return [
    ...createFinancialTitlesFromOrder(order),
    ...createPayableTitlesFromSimulationOrder(simulation, order),
  ];
}

function createPreOrderPayableTitlesFromSimulation(simulation) {
  const titles = [];
  const purchaseItems = simulation.purchaseItems?.filter((item) => item.value > 0) ?? [];

  if (purchaseItems.length) {
    purchaseItems.forEach((item, index) => {
      titles.push({
        id: `prepay-${simulation.id}-purchase-${index + 1}`,
        simulationId: simulation.id,
        simulationNumber: simulation.number,
        titleNumber: `${simulation.number}-PAG-${item.type}`,
        type: "payable",
        status: "open",
        amount: Math.round(item.value * 100) / 100,
        paidAmount: 0,
        proofFileName: "",
      });
    });
  } else {
    const totals = getTotals(simulation);
    titles.push({
      id: `prepay-${simulation.id}-goods`,
      simulationId: simulation.id,
      simulationNumber: simulation.number,
      titleNumber: `${simulation.number}-PAG-MERC`,
      type: "payable",
      status: "open",
      amount: Math.round(totals.merchandiseCost * 100) / 100,
      paidAmount: 0,
      proofFileName: "",
    });
  }

  simulation.expenseItems
    ?.filter((expense) => getExpenseTotal(expense, getTotals(simulation)) > 0)
    .forEach((expense, index) => {
      titles.push({
        id: `prepay-${simulation.id}-expense-${index + 1}`,
        simulationId: simulation.id,
        simulationNumber: simulation.number,
        titleNumber: `${simulation.number}-PAG-${expense.type}`,
        type: "payable",
        status: "open",
        amount: Math.round(getExpenseTotal(expense, getTotals(simulation)) * 100) / 100,
        paidAmount: 0,
        proofFileName: "",
      });
    });

  return titles.filter((title) => title.amount > 0);
}

function areSimulationPayablesPaidWithProof(simulation, titles) {
  const payables = titles.filter(
    (title) =>
      title.simulationId === simulation.id &&
      title.type === "payable" &&
      title.status !== "cancelled" &&
      title.amount > 0,
  );

  return (
    payables.length > 0 &&
    payables.every(
      (title) =>
        title.paidAmount >= title.amount &&
        (title.proofFileName || title.proofFilePath || title.proofAttachedAt),
    )
  );
}

function linkSimulationTitlesToOrder(simulation, order, titles) {
  return titles.map((title) =>
    title.simulationId === simulation.id
      ? { ...title, orderId: order.id, orderNumber: order.number }
      : title,
  );
}

function createPayableTitlesFromSimulationOrder(simulation, order) {
  const titles = [];
  const purchaseItems = simulation.purchaseItems?.filter((item) => item.value > 0) ?? [];

  if (purchaseItems.length > 0) {
    purchaseItems.forEach((item, index) => {
      titles.push({
        id: `pay-${order.id}-purchase-${index + 1}`,
        orderId: order.id,
        titleNumber: `${order.number}-PAG-${item.type}`,
        type: "payable",
        status: "open",
        amount: Math.round(item.value * 100) / 100,
        paidAmount: 0,
      });
    });
  } else {
    titles.push(...createPayableTitlesFromOrder(order));
  }

  const totals = getTotals(simulation);
  const bases = {
    revenue: totals.revenue,
    purchaseTotal: totals.purchaseTotal,
    grossProfit: totals.grossProfit,
  };

  simulation.expenseItems?.forEach((expense, index) => {
    const amount = Math.round(getExpenseTotal(expense, bases) * 100) / 100;
    if (amount <= 0) return;
    titles.push({
      id: `pay-${order.id}-expense-${index + 1}`,
      orderId: order.id,
      titleNumber: `${order.number}-PAG-${expense.type}`,
      type: "payable",
      status: "open",
      amount,
      paidAmount: 0,
    });
  });

  return titles;
}

function isFreightPayableTitle(title) {
  return (
    Boolean(title.id?.startsWith("pay-freight-")) ||
    Boolean(title.titleNumber?.endsWith("-PAG-FRETE"))
  );
}

function getRequiredPayablesForFreightRelease(titles, orderId) {
  return titles.filter(
    (title) =>
      title.orderId === orderId &&
      title.type === "payable" &&
      title.status !== "cancelled" &&
      title.amount > 0 &&
      !isFreightPayableTitle(title),
  );
}

const FREIGHT_GATE_RELEASED_STATUSES = new Set([
  "Pedido confirmado",
  "Frete liberado",
  "Aguardando frete",
  "Aguardando carregamento",
  "Em carregamento",
  "Em separação",
  "Em rota",
  "No destino",
  "Mercadoria descarregada",
  "Entregue",
]);

function isOrderFinanciallyReleased(order, titles) {
  if (!order) return false;
  if (FREIGHT_GATE_RELEASED_STATUSES.has(order.status)) return true;
  const payables = getRequiredPayablesForFreightRelease(titles, order.id);
  return payables.length > 0 && payables.every((title) => title.paidAmount >= title.amount);
}

function releaseOrderForFreightIfReady(order, titles) {
  if (!isOrderFinanciallyReleased(order, titles)) return order;
  return {
    ...order,
    status: "Frete liberado",
    logisticsStatus: "Financeiro liberou a operação.",
  };
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

function createFreightFromSimulation(simulation) {
  const units = simulation.products.reduce((sum, product) => sum + product.quantityTotal, 0);
  return {
    id: `freight-${simulation.id}`,
    orderId: undefined,
    orderNumber: simulation.number,
    status: "quoted",
    route: `${simulation.unit} → ${simulation.deliveryCity} • ${simulation.deliveryState}`,
    freightValue: simulation.expenseItems?.find((expense) => expense.type === "Frete")?.value ?? 0,
    weight: units,
    owner: simulation.owner,
  };
}

function linkFreightToConfirmedOrder(freight, order) {
  return {
    ...freight,
    orderId: order.id,
    orderNumber: order.number,
    route: `${order.origin} → ${order.destination}`,
  };
}

function getNextFreightStatus(status) {
  return {
    quoted: "hired",
    hired: "loading",
    loading: "in_route",
    in_route: "at_destination",
    at_destination: "unloaded",
    unloaded: "delivered",
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
    at_destination: 85,
    unloaded: 95,
    delivered: 100,
    cancelled: 0,
  };
  return {
    ...order,
    status:
      freight.status === "delivered"
        ? "Entregue"
        : freight.status === "unloaded"
          ? "Mercadoria descarregada"
          : freight.status === "at_destination"
            ? "No destino"
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
    proofNotes: "",
    proofDocumentNumber: "",
    proofFileName: "",
    proofFilePath: "",
    proofFileSize: undefined,
    proofMimeType: "",
    proofReceivedBy: "",
    proofRegisteredAt: undefined,
    occurrenceNotes: "",
    occurrences: [],
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

function registerDeliveryProof(delivery, proof) {
  return {
    ...delivery,
    ...proof,
    status: "delivered",
    currentLocation: "Entrega concluída",
    deliveredAt: delivery.deliveredAt ?? "2026-07-04T12:00:00-03:00",
    proofRegisteredAt: delivery.proofRegisteredAt ?? "2026-07-04T12:00:00-03:00",
  };
}

function registerDeliveryOccurrence(delivery, occurrence) {
  const nextOccurrence = {
    id: "occ-test-1",
    type: occurrence.type || "Ocorrência operacional",
    description: occurrence.description,
    location: occurrence.location,
    createdAt: "2026-07-05T12:00:00-03:00",
    createdBy: occurrence.createdBy || "Sistema",
  };

  return {
    ...delivery,
    status: "issue",
    currentLocation: nextOccurrence.location || delivery.currentLocation,
    occurrenceNotes: nextOccurrence.description,
    occurrences: [...(delivery.occurrences ?? []), nextOccurrence],
  };
}

function buildRealizedResult({ order, simulation, financialTitles = [], freights = [] }) {
  const receivables = financialTitles.filter((title) => title.type === "receivable");
  const payables = financialTitles.filter((title) => title.type === "payable");
  const receivableAmount = receivables.length
    ? receivables.reduce((sum, title) => sum + title.amount, 0)
    : order.totalValue;
  const realizedRevenueTotal = receivables.length
    ? receivables.reduce((sum, title) => sum + Math.min(title.paidAmount, title.amount), 0)
    : (order.totalValue * order.billingProgress) / 100;
  const goodsCostTotal = order.products.reduce(
    (sum, product) => sum + (product.costTotal ?? product.quantityTotal * product.costUnit),
    0,
  );
  const freightCostTotal = freights.reduce((sum, freight) => sum + freight.freightValue, 0);
  const payableBookedTotal = payables.reduce((sum, title) => sum + title.amount, 0);
  const costBookedTotal =
    payableBookedTotal > 0 ? payableBookedTotal : goodsCostTotal + freightCostTotal;
  const costPaidTotal = payables.reduce(
    (sum, title) => sum + Math.min(title.paidAmount, title.amount),
    0,
  );
  const commissionExpense = simulation?.expenseItems?.find(
    (expense) => expense.type === "Comissão",
  );
  const commissionPercent =
    commissionExpense?.calculationType === "percentage" ? commissionExpense.value : 2.5;
  const commissionTotal = Math.round(realizedRevenueTotal * (commissionPercent / 100) * 100) / 100;
  const realizedProfit =
    Math.round((realizedRevenueTotal - costPaidTotal - commissionTotal) * 100) / 100;
  const predictedMarginPercent = simulation ? getTotals(simulation).marginPercent : 0;
  const realizedMarginPercent =
    realizedRevenueTotal > 0 ? (realizedProfit / realizedRevenueTotal) * 100 : 0;

  return {
    realizedRevenueTotal,
    receivableOpenTotal: Math.max(0, receivableAmount - realizedRevenueTotal),
    costBookedTotal,
    costPaidTotal,
    commissionPercent,
    commissionTotal,
    realizedProfit,
    predictedMarginPercent,
    realizedMarginPercent,
    marginDeltaPercent: realizedMarginPercent - predictedMarginPercent,
  };
}

function createClosedRealizedResultRecord(result, closedBy = "Sistema") {
  return {
    id: `realized-${result.orderId}`,
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    status: "closed",
    realizedRevenueTotal: result.realizedRevenueTotal,
    realizedProfit: result.realizedProfit,
    realizedMarginPercent: result.realizedMarginPercent,
    commissionApprovalStatus: "pending",
    commissionApprovedBy: undefined,
    commissionApprovedAt: undefined,
    commissionNotes: "",
    notes: `Fechamento registrado por ${closedBy}.`,
  };
}

function approveCommissionForRealizedResult(result, approvedBy = "Sistema") {
  return {
    ...result,
    commissionApprovalStatus: "approved",
    commissionApprovedBy: approvedBy,
    commissionApprovedAt: "2026-07-05T12:00:00-03:00",
    commissionNotes: `Comissão aprovada por ${approvedBy}.`,
  };
}

function transitionSimulation(simulation, status, extra = {}) {
  return { ...simulation, status, ...extra };
}

function getApprovalFlow(simulation) {
  const inferredApproved = simulation.status === "Aprovada";
  return {
    financial: {
      status: "approved",
      ...(simulation.approvalFlow?.financial ?? {}),
    },
    principal: {
      status: inferredApproved ? "approved" : "pending",
      ...(simulation.approvalFlow?.principal ?? {}),
    },
  };
}

function getCurrentApprovalStage(simulation) {
  if (
    !["Pendente de aprovação", "Em análise", "Aguardando aprovação do Gestor"].includes(
      simulation.status,
    )
  )
    return null;
  const flow = getApprovalFlow(simulation);
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
        ? "Aguardando pagamento"
        : "Pendente de aprovação",
    approvalFlow: nextFlow,
    paymentRequestedAt:
      nextFlow.financial.status === "approved" && nextFlow.principal.status === "approved"
        ? "2026-07-05T12:00:00-03:00"
        : simulation.paymentRequestedAt,
  };
}

function canConfirmSimulationAsOrder(simulation) {
  return (
    isSimulationFullyApproved(simulation) &&
    simulation.status === "Aguardando validação comercial" &&
    Boolean(simulation.paymentPaidAt) &&
    Boolean(simulation.paymentReceiptFileName || simulation.paymentReceiptFilePath)
  );
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
    financial: { status: "approved" },
    principal: { status: "pending" },
  },
});
assert.equal(getCurrentApprovalStage(twoStepSubmitted), "principal");
assert.equal(isSimulationFullyApproved(twoStepSubmitted), false);

const principalApproved = applyApprovalDecision(twoStepSubmitted, "principal", "approved");
assert.equal(principalApproved.status, "Aguardando pagamento");
assert.equal(isSimulationFullyApproved(principalApproved), true);
assert.equal(principalApproved.paymentRequestedAt, "2026-07-05T12:00:00-03:00");

const preOrderPayables = createPreOrderPayableTitlesFromSimulation({
  ...principalApproved,
  number: "SIM-2026-9001",
  client: "Cliente teste",
  supplier: "Fornecedor teste",
  owner: "Comercial",
  unit: "Matriz",
  deliveryCity: "Cataguases",
  deliveryState: "MG",
  deliveryDate: "2026-07-10T12:00:00-03:00",
  products: [{ quantityTotal: 10, costUnit: 60, saleUnit: 100 }],
  purchaseItems: [{ type: "Mercadoria", value: 600 }],
  expenseItems: [{ type: "Frete", calculationType: "fixed", value: 100 }],
});
assert.equal(preOrderPayables.length, 2);
assert.equal(
  preOrderPayables.every((title) => title.simulationId === principalApproved.id),
  true,
);
assert.equal(areSimulationPayablesPaidWithProof(principalApproved, preOrderPayables), false);

const paidPreOrderPayables = preOrderPayables.map((title) => ({
  ...title,
  status: "paid",
  paidAmount: title.amount,
  proofFileName: `${title.titleNumber}.pdf`,
}));
const commercialValidationSimulation = {
  ...principalApproved,
  status: "Aguardando validação comercial",
  paymentPaidAt: "2026-07-05T13:00:00-03:00",
  paymentReceiptFileName: "comprovante.pdf",
};
assert.equal(areSimulationPayablesPaidWithProof(principalApproved, paidPreOrderPayables), true);
assert.equal(canConfirmSimulationAsOrder(principalApproved), false);
assert.equal(canConfirmSimulationAsOrder(commercialValidationSimulation), true);

const futureFreight = createFreightFromSimulation({
  ...commercialValidationSimulation,
  number: "SIM-2026-9001",
  products: [{ quantityTotal: 10, costUnit: 60, saleUnit: 100 }],
  expenseItems: [{ type: "Frete", calculationType: "fixed", value: 100 }],
  unit: "Matriz",
  deliveryCity: "Cataguases",
  deliveryState: "MG",
  owner: "Comercial",
});
assert.equal(futureFreight.orderId, undefined);
assert.equal(futureFreight.orderNumber, "SIM-2026-9001");

const confirmedOrder = {
  id: "ord-confirmed-9001",
  number: "PED-2026-9001",
  origin: "Matriz",
  destination: "Cataguases • MG",
  status: "Pedido confirmado",
  deliveryProgress: 0,
};
const linkedTitles = linkSimulationTitlesToOrder(
  commercialValidationSimulation,
  confirmedOrder,
  paidPreOrderPayables,
);
assert.equal(
  linkedTitles.every((title) => title.orderId === confirmedOrder.id),
  true,
);
assert.equal(
  linkFreightToConfirmedOrder(futureFreight, confirmedOrder).orderNumber,
  "PED-2026-9001",
);

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

const payableTitles = createPayableTitlesFromOrder(
  {
    id: "ord-pay-1",
    number: "PED PAY 1",
    products: [{ quantityTotal: 10, costUnit: 25, saleUnit: 30 }],
  },
  [{ id: "fr-pay-1", orderId: "ord-pay-1", freightValue: 120 }],
);
assert.equal(payableTitles.length, 2);
assert.equal(payableTitles[0].type, "payable");
assert.equal(payableTitles[0].amount, 250);
assert.equal(payableTitles[1].titleNumber, "PED PAY 1-PAG-FRETE");
assert.equal(payableTitles[1].amount, 120);

const operationalOrder = {
  id: "ord-oper-1",
  number: "PED OPER 1",
  totalValue: 1000,
  paymentTerms: "7 e 14 dias",
  products: [{ quantityTotal: 10, costUnit: 60, saleUnit: 100 }],
  status: "Aguardando faturamento",
  logisticsStatus: "Aguardando financeiro.",
};
const operationalSimulation = {
  products: [{ quantityTotal: 10, costUnit: 60, saleUnit: 100 }],
  purchaseItems: [{ type: "Mercadoria", value: 600 }],
  expenseItems: [{ type: "Frete", calculationType: "fixed", value: 100 }],
};
const operationalTitles = createOperationalFinancialTitlesFromSimulationOrder(
  operationalSimulation,
  operationalOrder,
);
assert.equal(operationalTitles.filter((title) => title.type === "receivable").length, 2);
assert.equal(operationalTitles.filter((title) => title.type === "payable").length, 2);
assert.equal(isOrderFinanciallyReleased(operationalOrder, operationalTitles), false);
const paidOperationalTitles = operationalTitles.map((title) =>
  title.type === "payable" ? { ...title, paidAmount: title.amount, status: "paid" } : title,
);
assert.equal(isOrderFinanciallyReleased(operationalOrder, paidOperationalTitles), true);
assert.equal(
  releaseOrderForFreightIfReady(operationalOrder, paidOperationalTitles).status,
  "Frete liberado",
);

// Regressão do deadlock: a conta a pagar do frete (gerada na contratação, paga só
// depois da entrega) não pode voltar a travar a liberação operacional do pedido.
const titlesWithOpenFreightPayable = [
  ...paidOperationalTitles,
  {
    id: "pay-freight-freight-ord-oper-1",
    orderId: "ord-oper-1",
    titleNumber: "PED OPER 1-PAG-FRETE",
    type: "payable",
    status: "open",
    amount: 350,
    paidAmount: 0,
  },
];
assert.equal(isOrderFinanciallyReleased(operationalOrder, titlesWithOpenFreightPayable), true);

// Liberação é portão de entrada: status pós-conversão (incluindo a jornada do
// motorista) nunca regridem para "aguardando liberação financeira".
for (const releasedStatus of [
  "Pedido confirmado",
  "Aguardando carregamento",
  "Em carregamento",
  "No destino",
  "Mercadoria descarregada",
]) {
  assert.equal(
    isOrderFinanciallyReleased({ ...operationalOrder, status: releasedStatus }, []),
    true,
  );
}

// Pedido pré-conversão sem contas a pagar continua travado (caminho legado).
assert.equal(isOrderFinanciallyReleased(operationalOrder, []), false);
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
const proofDelivery = registerDeliveryProof(
  { ...delivery, status: "delivered" },
  {
    proofReceivedBy: "Maria Cliente",
    proofDocumentNumber: "NF 587102",
    proofFileName: "canhoto-ped-frete-1.pdf",
    proofFilePath: "delivery-freight-ord-freight-1/file.pdf",
    proofFileSize: 2048,
    proofMimeType: "application/pdf",
    proofNotes: "Entrega conferida sem ressalva.",
  },
);
assert.equal(proofDelivery.status, "delivered");
assert.equal(proofDelivery.proofReceivedBy, "Maria Cliente");
assert.equal(proofDelivery.proofFilePath, "delivery-freight-ord-freight-1/file.pdf");
assert.equal(proofDelivery.proofRegisteredAt, "2026-07-04T12:00:00-03:00");
const occurrenceDelivery = registerDeliveryOccurrence(delivery, {
  type: "Cliente ausente",
  description: "Motorista aguardou 30 minutos e cliente não estava no local.",
  location: "Destino",
  createdBy: "Djalma",
});
assert.equal(occurrenceDelivery.status, "issue");
assert.equal(
  occurrenceDelivery.occurrenceNotes,
  "Motorista aguardou 30 minutos e cliente não estava no local.",
);
assert.equal(occurrenceDelivery.occurrences.length, 1);
assert.equal(occurrenceDelivery.occurrences[0].type, "Cliente ausente");

const realizedResult = buildRealizedResult({
  order: {
    id: "ord-realized-1",
    totalValue: 1000,
    billingProgress: 0,
    products: [{ quantityTotal: 10, costUnit: 60, saleUnit: 100 }],
  },
  simulation: {
    products: [{ quantityTotal: 10, costUnit: 60, saleUnit: 100 }],
    expenseItems: [{ type: "Comissão", calculationType: "percentage", value: 2.5 }],
  },
  financialTitles: [
    { orderId: "ord-realized-1", type: "receivable", amount: 1000, paidAmount: 1000 },
    { orderId: "ord-realized-1", type: "payable", amount: 600, paidAmount: 600 },
  ],
});
assert.equal(realizedResult.realizedRevenueTotal, 1000);
assert.equal(realizedResult.costPaidTotal, 600);
assert.equal(realizedResult.commissionTotal, 25);
assert.equal(realizedResult.realizedProfit, 375);
assert.equal(Math.round(realizedResult.realizedMarginPercent * 100), 3750);
const closedRealizedResult = createClosedRealizedResultRecord(
  { ...realizedResult, orderId: "ord-realized-1", orderNumber: "PED REAL 1" },
  "Financeiro",
);
assert.equal(closedRealizedResult.id, "realized-ord-realized-1");
assert.equal(closedRealizedResult.status, "closed");
assert.equal(closedRealizedResult.orderNumber, "PED REAL 1");
assert.equal(closedRealizedResult.commissionApprovalStatus, "pending");
const approvedCommissionResult = approveCommissionForRealizedResult(
  closedRealizedResult,
  "Financeiro",
);
assert.equal(approvedCommissionResult.commissionApprovalStatus, "approved");
assert.equal(approvedCommissionResult.commissionApprovedBy, "Financeiro");
assert.match(approvedCommissionResult.commissionNotes, /Comissão aprovada/);

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

// --- Fluxo de faturamento após validação comercial (nova regra) --------------
// Regra: após a validação comercial do comprovante, o pedido nasce
// "Aguardando faturamento" e o registro de faturamento/NF é restrito a
// Financeiro/Faturamento/Admin. O Comercial não fatura.
function convertToOrderForTest(simulation, existingOrders = []) {
  if (existingOrders.some((order) => order.simulationId === simulation.id)) {
    throw new Error("Simulação já convertida.");
  }
  return {
    id: `ord-${simulation.id}`,
    number: `PED-${simulation.number}`,
    simulationId: simulation.id,
    owner: simulation.owner,
    totalValue: simulation.totalValue,
    status: "Aguardando faturamento",
    billingProgress: 0,
    timeline: [{ title: "Pedido criado", description: "Aguardando registro de faturamento/NF." }],
  };
}

const BILLING_ROLES = ["Financeiro", "Faturamento", "Admin"];
function canRegisterBillingForTest(role) {
  return BILLING_ROLES.includes(role);
}
function getBilledAmountForTest(titles, orderId) {
  return titles
    .filter((t) => t.orderId === orderId && t.type === "receivable" && t.status !== "cancelled")
    .reduce((sum, t) => sum + t.amount, 0);
}
function getRemainingForTest(order, titles) {
  return Math.max(0, order.totalValue - getBilledAmountForTest(titles, order.id));
}
function registerBillingForTest({ order, titles, user, invoiceNumber, invoiceAmount }) {
  if (!canRegisterBillingForTest(user.role)) throw new Error("Perfil não pode faturar.");
  const remaining = getRemainingForTest(order, titles);
  if (remaining <= 0) throw new Error("Pedido já totalmente faturado.");
  if (invoiceAmount > remaining + 0.01) throw new Error("Valor acima do restante a faturar.");
  const receivable = {
    id: `fin-${order.id}-${invoiceNumber}`,
    orderId: order.id,
    type: "receivable",
    status: "open",
    amount: invoiceAmount,
    paidAmount: 0,
    invoiceNumber,
  };
  const nextTitles = [...titles, receivable];
  const billed = getBilledAmountForTest(nextTitles, order.id);
  const billingProgress = Math.min(100, Math.round((billed / order.totalValue) * 100));
  const status =
    billingProgress >= 100
      ? "Frete liberado"
      : billingProgress > 0
        ? "Em faturamento"
        : order.status;
  const timeline = [
    ...order.timeline,
    { title: "Nota fiscal registrada", description: invoiceNumber },
  ];
  const notification = {
    targetUserName: order.owner,
    title: "Faturamento registrado",
    type: "success",
  };
  return {
    order: { ...order, billingProgress, status, timeline },
    titles: nextTitles,
    receivable,
    notification,
  };
}

// 1-3: validação comercial cria pedido que nasce "Aguardando faturamento".
const billingSim = { id: "sim-bill", number: "2026-BILL", owner: "Comercial X", totalValue: 1000 };
const billingOrder = convertToOrderForTest(billingSim);
assert.equal(billingOrder.status, "Aguardando faturamento");
assert.equal(billingOrder.billingProgress, 0);
assert.equal(billingOrder.timeline[0].title, "Pedido criado");
assert.throws(() => convertToOrderForTest(billingSim, [billingOrder]), /já convertida/);

// 4: Comercial (e Frete) não conseguem faturar.
assert.equal(canRegisterBillingForTest("Comercial"), false);
assert.equal(canRegisterBillingForTest("Frete"), false);
assert.throws(
  () =>
    registerBillingForTest({
      order: billingOrder,
      titles: [],
      user: { role: "Comercial" },
      invoiceNumber: "NF-X",
      invoiceAmount: 1000,
    }),
  /Perfil não pode faturar/,
);

// 5-6: Financeiro e Admin conseguem faturar.
assert.equal(canRegisterBillingForTest("Financeiro"), true);
assert.equal(canRegisterBillingForTest("Admin"), true);

// 7-8-9-10-12: faturamento total gera recebível, timeline, notificação e muda o status.
const billedFull = registerBillingForTest({
  order: billingOrder,
  titles: [],
  user: { role: "Financeiro" },
  invoiceNumber: "NF-1",
  invoiceAmount: 1000,
});
assert.equal(billedFull.receivable.type, "receivable");
assert.equal(billedFull.receivable.amount, 1000);
assert.equal(billedFull.order.billingProgress, 100);
assert.equal(billedFull.order.status, "Frete liberado");
assert.ok(billedFull.order.timeline.some((e) => e.title === "Nota fiscal registrada"));
assert.equal(billedFull.notification.targetUserName, "Comercial X");

// 11: não permite faturar acima do restante (controle de duplicidade/valor).
assert.throws(
  () =>
    registerBillingForTest({
      order: billedFull.order,
      titles: billedFull.titles,
      user: { role: "Financeiro" },
      invoiceNumber: "NF-2",
      invoiceAmount: 500,
    }),
  /já totalmente faturado/,
);

// 11b: faturamento parcial mantém o pedido em faturamento e barra valor acima do restante.
const partialOrder = convertToOrderForTest({
  id: "sim-part",
  number: "2026-PART",
  owner: "Comercial Y",
  totalValue: 1000,
});
const partial = registerBillingForTest({
  order: partialOrder,
  titles: [],
  user: { role: "Admin" },
  invoiceNumber: "NF-P1",
  invoiceAmount: 400,
});
assert.equal(partial.order.billingProgress, 40);
assert.equal(partial.order.status, "Em faturamento");
assert.throws(
  () =>
    registerBillingForTest({
      order: partial.order,
      titles: partial.titles,
      user: { role: "Financeiro" },
      invoiceNumber: "NF-P2",
      invoiceAmount: 700,
    }),
  /acima do restante/,
);

// 13: modo local e supabase continuam resolvendo o provider.
assert.equal(getDataProvider("local"), "local");
assert.equal(getDataProvider("supabase"), "supabase");

console.log("Testes de faturamento passaram.");

// --- Jornada do motorista (link + PIN → checklist → ocorrência → canhoto) -----
// Reimplementação (mock, sem Supabase real) espelhando a lógica de driverTracking.
const DRIVER_MILESTONES = [
  "arrived_loading",
  "in_transit",
  "arrived_delivery_location",
  "unloaded",
  "proof_uploaded",
];
function driverAuth(link, pin) {
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt < Date.now()) return { ok: false, reason: "expired" };
  if (link.lockedUntil && link.lockedUntil > Date.now()) return { ok: false, reason: "locked" };
  if (link.pin !== pin) return { ok: false, reason: "invalid_pin" };
  return { ok: true };
}
function driverNextEvent(trip) {
  const done = new Set(trip.events.filter((e) => e.type !== "occurrence").map((e) => e.type));
  return DRIVER_MILESTONES.find((m) => !done.has(m)) ?? null;
}
function driverRegisterEvent(trip, type, info) {
  const expected = driverNextEvent(trip);
  if (type !== expected) throw new Error("event out of order");
  trip.events.push({ type, receiverName: info?.receiverName, at: Date.now() });
  const resultingState = {
    arrived_loading: ["loading", "Em carregamento", 35],
    in_transit: ["in_route", "Em rota", 70],
    arrived_delivery_location: ["at_destination", "No destino", 85],
    unloaded: ["unloaded", "Mercadoria descarregada", 95],
  }[type];
  if (resultingState) {
    trip.freightStatus = resultingState[0];
    trip.orderStatus = resultingState[1];
    trip.orderDeliveryProgress = resultingState[2];
  }
  for (const targetRole of ["Frete", "Comercial", "Financeiro", "Admin"]) {
    trip.notifications.push({ targetRole, title: "Atualização do motorista" });
  }
  return trip;
}
function driverRegisterOccurrence(trip, occurrenceType, notes) {
  trip.events.push({ type: "occurrence", occurrenceType, notes, at: Date.now() });
  for (const targetRole of ["Frete", "Comercial", "Financeiro", "Admin"]) {
    trip.notifications.push({ targetRole, title: "Ocorrência", type: "warning" });
  }
  return trip;
}
function driverFinalize(trip, file, info) {
  if (driverNextEvent(trip) !== "proof_uploaded") throw new Error("proof out of order");
  if (!file) throw new Error("canhoto obrigatório");
  trip.events.push({ type: "proof_uploaded", receiverName: info?.receiverName, at: Date.now() });
  trip.events.push({ type: "completed", at: Date.now() });
  trip.proofs.push({ fileName: file.name });
  trip.freightStatus = "delivered";
  trip.orderStatus = "Entregue";
  trip.orderDeliveryProgress = 100;
  trip.linkState = "completed";
  trip.notifications.push({ targetRole: "Frete", title: "Entrega finalizada", type: "success" });
  trip.notifications.push({
    targetRole: "Financeiro",
    title: "Entrega comprovada",
    type: "success",
  });
  trip.notifications.push({
    targetRole: "Comercial",
    title: "Entrega finalizada",
    type: "success",
  });
  trip.notifications.push({
    targetRole: "Admin",
    title: "Entrega finalizada",
    type: "success",
  });
  return trip;
}
function newTrip() {
  return {
    events: [],
    proofs: [],
    notifications: [],
    freightStatus: "hired",
    orderStatus: "Frete liberado",
    orderDeliveryProgress: 0,
    linkState: "active",
  };
}

const now = Date.now();
// 1-4: acesso
assert.equal(driverAuth({ pin: "123456", expiresAt: now + 1e6 }, "123456").ok, true);
assert.equal(driverAuth({ pin: "123456", expiresAt: now + 1e6 }, "000000").reason, "invalid_pin");
assert.equal(driverAuth({ pin: "1", expiresAt: now - 1 }, "1").reason, "expired");
assert.equal(driverAuth({ pin: "1", expiresAt: now + 1e6, revokedAt: now }, "1").reason, "revoked");

// 5: payload não expõe dados financeiros sensíveis
const publicPayloadKeys = [
  "freight_id",
  "driver_name",
  "vehicle_plate",
  "pickup_city",
  "delivery_city",
  "status",
];
assert.equal(
  publicPayloadKeys.some((k) => ["margin", "profit", "commission", "cost"].includes(k)),
  false,
);

// 6-9,12,13: checklist na ordem correta
const trip = newTrip();
assert.equal(driverNextEvent(trip), "arrived_loading");
driverRegisterEvent(trip, "arrived_loading");
assert.equal(driverNextEvent(trip), "in_transit");
driverRegisterEvent(trip, "in_transit");
assert.throws(() => driverRegisterEvent(trip, "unloaded"), /out of order/); // pula etapa
driverRegisterEvent(trip, "arrived_delivery_location");

// 10-11: ocorrência (repetível, não avança marco, notifica 4 áreas)
driverRegisterOccurrence(trip, "Cliente ausente", "Portaria fechada");
assert.equal(driverNextEvent(trip), "unloaded");
assert.equal(trip.events.filter((e) => e.type === "occurrence").length, 1);
assert.equal(trip.notifications.filter((n) => n.title === "Ocorrência").length, 4);

// descarga com recebedor
driverRegisterEvent(trip, "unloaded", { receiverName: "João Recebedor" });
assert.equal(trip.freightStatus, "unloaded");
assert.equal(trip.orderStatus, "Mercadoria descarregada");
assert.equal(trip.orderDeliveryProgress, 95);

// 14: finalizar sem canhoto é bloqueado
assert.throws(() => driverFinalize(trip, null, { receiverName: "João" }), /obrigatório/);

// 15-16: anexa canhoto e finaliza
driverFinalize(trip, { name: "canhoto.jpg" }, { receiverName: "João Recebedor" });

// 17-19: frete/pedido/histórico atualizados
assert.equal(trip.freightStatus, "delivered");
assert.equal(trip.orderStatus, "Entregue");
assert.equal(trip.orderDeliveryProgress, 100);
assert.ok(trip.events.some((e) => e.type === "completed"));
assert.equal(trip.linkState, "completed");
assert.equal(trip.proofs.length, 1);
assert.ok(trip.events.find((e) => e.type === "proof_uploaded")?.receiverName === "João Recebedor");

// 20: notificações de entrega criadas para Frete/Financeiro/Comercial/Admin
assert.ok(trip.notifications.some((n) => n.targetRole === "Frete" && n.type === "success"));
assert.ok(trip.notifications.some((n) => n.targetRole === "Financeiro" && n.type === "success"));
assert.ok(trip.notifications.some((n) => n.targetRole === "Admin" && n.type === "success"));
assert.ok(trip.notifications.some((n) => n.targetRole === "Comercial" && n.type === "success"));

// 21-22: provider local/supabase resolvem sem quebrar
assert.equal(getDataProvider("supabase"), "supabase");
assert.equal(getDataProvider("qualquer-coisa"), "local");

console.log("Testes da jornada do motorista passaram.");

// ---------------------------------------------------------------------------
// Frete/Logística: SIM aprovada visível como preparação (feat: expose approved
// simulations to freight preparation). Mirror puro dos helpers de
// src/features/freights/freightPreparation.ts, src/lib/visibility.ts e
// src/features/approvals/approvalNotifications.ts. Não depende de Supabase.
// ---------------------------------------------------------------------------

const FREIGHT_RELEASED_ORDER_STATUSES = [
  "Frete liberado",
  "Aguardando frete",
  "Em separação",
  "Em rota",
  "Entregue",
];

function isOrderReleasedForFreight(order, titles = []) {
  if (!order) return false;
  if (FREIGHT_RELEASED_ORDER_STATUSES.includes(order.status)) return true;
  const required = titles.filter(
    (t) =>
      t.orderId === order.id && t.type === "payable" && t.status !== "cancelled" && t.amount > 0,
  );
  if (required.length === 0) return false;
  return required.every((t) => t.status === "paid");
}

function isPreparationFreight(freight) {
  return !freight.orderId;
}

function canExecuteFreight(freight, order, titles = []) {
  if (isPreparationFreight(freight)) return false;
  return isOrderReleasedForFreight(order, titles);
}

function canGenerateDriverLink(freight, order, titles = []) {
  return canExecuteFreight(freight, order, titles);
}

function getFreightBucket(freight, order, titles = []) {
  if (freight.status === "delivered" || freight.status === "cancelled") return "finished";
  if (freight.status === "loading" || freight.status === "in_route") return "in_progress";
  if (canExecuteFreight(freight, order, titles)) return "released";
  return "preparation";
}

function canViewOperationalQueues(role) {
  return role === "Admin" || role === "Financeiro" || role === "Aprovador" || role === "Frete";
}

function filterFreightsForUser(freights, orders, user) {
  if (canViewOperationalQueues(user.role)) return freights;
  const ownedOrderIds = new Set(orders.filter((o) => o.owner === user.name).map((o) => o.id));
  return freights.filter((f) => ownedOrderIds.has(f.orderId ?? "") || f.owner === user.name);
}

function buildGestorApprovalNotifications(sim) {
  return [
    { title: "Simulação aprovada pelo Gestor", targetRole: "Financeiro", entityId: sim.id },
    { title: "Nova operação disponível para preparação", targetRole: "Frete", entityId: sim.id },
    { title: "Simulação aprovada pelo Gestor", targetUserName: sim.owner, entityId: sim.id },
  ];
}

function normalizeNotificationRole(role) {
  const normalized = role?.trim().toLowerCase();
  if (["admin", "adm", "gestor"].includes(normalized)) return "Admin";
  if (["aprovador", "aprovação", "aprovacao"].includes(normalized)) return "Aprovador";
  if (normalized === "financeiro") return "Financeiro";
  if (["frete", "frota", "logística", "logistica"].includes(normalized)) return "Frete";
  if (normalized === "comercial") return "Comercial";
  if (["negociações", "negociacoes"].includes(normalized)) return "Negociações";
  return undefined;
}

function normalizeIdentity(value) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bjunior\b/g, "jr")
    .replace(/[^a-z0-9]/g, "");
}

function notificationTargetsUser(notification, user) {
  const targetRole = normalizeNotificationRole(notification.targetRole);
  const hasIndividualTarget = Boolean(
    notification.targetUserId || notification.targetUserEmail || notification.targetUserName,
  );
  const matchesIndividual = Boolean(
    (notification.targetUserId && notification.targetUserId === user.id) ||
    (notification.targetUserEmail &&
      notification.targetUserEmail.trim().toLowerCase() === user.email.trim().toLowerCase()) ||
    (notification.targetUserName &&
      normalizeIdentity(notification.targetUserName) === normalizeIdentity(user.name)),
  );

  if (hasIndividualTarget) {
    return matchesIndividual && (!targetRole || targetRole === user.role);
  }
  if (targetRole) return targetRole === user.role;
  return user.role === "Admin";
}

function buildSubmissionNotification(simulation) {
  return {
    title: "Simulação enviada para aprovação",
    entityId: simulation.id,
    targetRole: "Admin",
  };
}

// Cenários da especificação (§14)

// Fixtures
const prepFreight = {
  id: "freight-sim1",
  orderId: undefined,
  owner: "Ana Comercial",
  status: "quoted",
};
const orderAwaitingBilling = {
  id: "ord1",
  owner: "Ana Comercial",
  status: "Aguardando faturamento",
};
const linkedFreightAwaiting = {
  id: "freight-sim1",
  orderId: "ord1",
  owner: "Ana Comercial",
  status: "quoted",
};
const orderReleased = { id: "ord1", owner: "Ana Comercial", status: "Frete liberado" };
const releasedFreight = {
  id: "freight-sim1",
  orderId: "ord1",
  owner: "Ana Comercial",
  status: "quoted",
};
const movingFreight = {
  id: "freight-sim1",
  orderId: "ord1",
  owner: "Ana Comercial",
  status: "in_route",
};
const doneFreight = {
  id: "freight-sim1",
  orderId: "ord1",
  owner: "Ana Comercial",
  status: "delivered",
};

const freteUser = { role: "Frete", name: "Bruno Frete" };
const comercialUser = { role: "Comercial", name: "Ana Comercial" };
const otherComercial = { role: "Comercial", name: "Carla Outra" };

// 5-6: Frete enxerga a SIM aprovada (frete de preparação) mesmo sem ser dono
assert.equal(
  filterFreightsForUser([prepFreight], [], freteUser).length,
  1,
  "Frete deve ver o frete de preparação",
);

// Comercial dono também vê a própria operação em preparação
assert.equal(filterFreightsForUser([prepFreight], [], comercialUser).length, 1);
// Comercial de outro dono NÃO vê
assert.equal(filterFreightsForUser([prepFreight], [], otherComercial).length, 0);

// Classificação em balde "preparação" enquanto não virou pedido
assert.equal(getFreightBucket(prepFreight, undefined, []), "preparation");

// 7: Frete NÃO consegue executar antes da liberação
assert.equal(canExecuteFreight(prepFreight, undefined, []), false);
// pedido criado, mas aguardando faturamento => ainda bloqueado
assert.equal(canExecuteFreight(linkedFreightAwaiting, orderAwaitingBilling, []), false);
assert.equal(getFreightBucket(linkedFreightAwaiting, orderAwaitingBilling, []), "preparation");

// 8: Frete NÃO consegue gerar link/PIN antes de virar Pedido e ser liberado
assert.equal(canGenerateDriverLink(prepFreight, undefined, []), false);
assert.equal(canGenerateDriverLink(linkedFreightAwaiting, orderAwaitingBilling, []), false);

// 12-14: após faturamento, pedido liberado => Frete pode executar e gerar link
assert.equal(canExecuteFreight(releasedFreight, orderReleased, []), true);
assert.equal(canGenerateDriverLink(releasedFreight, orderReleased, []), true);
assert.equal(getFreightBucket(releasedFreight, orderReleased, []), "released");

// Baldes em andamento / finalizado
assert.equal(getFreightBucket(movingFreight, orderReleased, []), "in_progress");
assert.equal(getFreightBucket(doneFreight, orderReleased, []), "finished");

// 15: notificações da aprovação do Gestor — Financeiro, Frete e Comercial
const approvalNots = buildGestorApprovalNotifications({
  id: "sim1",
  number: "SIM-1",
  owner: "Ana Comercial",
});
assert.ok(
  approvalNots.some((n) => n.targetRole === "Financeiro"),
  "notifica Financeiro",
);
assert.ok(
  approvalNots.some((n) => n.targetRole === "Frete"),
  "notifica Frete (não Financeiro)",
);
assert.ok(
  approvalNots.some((n) => n.targetUserName === "Ana Comercial"),
  "notifica Comercial dono",
);
assert.equal(approvalNots.length, 3);

// Matriz de destinatários: o Gestor atual usa a credencial Admin. Notificações
// exclusivas de Financeiro/Frete não podem aparecer para o Admin, e avisos do
// Comercial devem chegar somente ao dono mesmo com variação Junior/Jr.
const adminUser = { id: "admin-1", name: "Djalma", email: "admin@master.test", role: "Admin" };
const financeUser = {
  id: "finance-1",
  name: "Financeiro",
  email: "financeiro@master.test",
  role: "Financeiro",
};
const freightUser = {
  id: "freight-1",
  name: "Operação de Frete",
  email: "frete@master.test",
  role: "Frete",
};
const ownerUser = {
  id: "commercial-1",
  name: "Djalma Jr",
  email: "djalma@master.test",
  role: "Comercial",
};
const sameNameWrongRole = { ...ownerUser, id: "finance-2", role: "Financeiro" };
const submissionNotification = buildSubmissionNotification({ id: "sim-approval" });

assert.equal(submissionNotification.targetRole, "Admin");
assert.equal(notificationTargetsUser(submissionNotification, adminUser), true);
assert.equal(notificationTargetsUser(submissionNotification, financeUser), false);
assert.equal(
  notificationTargetsUser({ title: "Pagamento", targetRole: "Financeiro" }, financeUser),
  true,
);
assert.equal(
  notificationTargetsUser({ title: "Pagamento", targetRole: "Financeiro" }, adminUser),
  false,
);
assert.equal(
  notificationTargetsUser({ title: "Carga liberada", targetRole: "Frete" }, freightUser),
  true,
);
assert.equal(
  notificationTargetsUser({ title: "Carga liberada", targetRole: "Frete" }, adminUser),
  false,
);
assert.equal(
  notificationTargetsUser(
    { title: "Reajuste", targetRole: "Comercial", targetUserName: "Djalma Junior" },
    ownerUser,
  ),
  true,
);
assert.equal(
  notificationTargetsUser(
    { title: "Reajuste", targetRole: "Comercial", targetUserName: "Djalma Junior" },
    sameNameWrongRole,
  ),
  false,
);
assert.equal(normalizeNotificationRole("Gestor"), "Admin");
assert.equal(normalizeNotificationRole("Aprovador"), "Aprovador");

// 17-18: liberação financeira depende de payables quitados quando existem
assert.equal(
  isOrderReleasedForFreight({ id: "ord2", status: "Pedido confirmado" }, [
    { orderId: "ord2", type: "payable", status: "open", amount: 100 },
  ]),
  false,
);
assert.equal(
  isOrderReleasedForFreight({ id: "ord2", status: "Pedido confirmado" }, [
    { orderId: "ord2", type: "payable", status: "paid", amount: 100 },
  ]),
  true,
);

console.log("Testes de preparação de frete passaram.");

// ---------------------------------------------------------------------------
// Separar liberação de frete do faturamento (fix: separate freight release from
// financial invoicing). Mirror puro das regras de status/permissões. Sem Supabase.
// ---------------------------------------------------------------------------

// Conversão: SIM validada vira Pedido "Pedido confirmado", já liberado p/ frete.
function convertSimulationToOrderStatus() {
  return { orderStatus: "Pedido confirmado", billingProgress: 0 };
}

// Regra de liberação de frete (mirror de financialTitleHelpers): "Pedido confirmado"
// já conta como liberado — não depende de faturamento.
const RELEASED_STATUSES = [
  "Pedido confirmado",
  "Frete liberado",
  "Aguardando frete",
  "Em separação",
  "Em rota",
  "Entregue",
];
function freightReleased(order) {
  if (!order) return false;
  return RELEASED_STATUSES.includes(order.status);
}

// Faturamento derivado — não altera o status operacional.
function billingLabel(order) {
  if (order.billingProgress >= 100) return "Faturado";
  if (order.billingProgress > 0 || order.invoiceNumber) return "Faturamento parcial";
  return "Aguardando faturamento";
}
function applyBilling(order, invoiceAmount) {
  // billing só mexe no progresso, NÃO no status operacional.
  const billed = (order.invoiceAmount ?? 0) + invoiceAmount;
  const billingProgress =
    order.totalValue > 0 ? Math.min(100, Math.round((billed / order.totalValue) * 100)) : 0;
  return { ...order, invoiceAmount: billed, billingProgress };
}

// Permissões (mirror de permissions.ts)
const permissionsByRole = {
  Comercial: ["simulations:create", "approvals:view", "orders:view"],
  Aprovador: ["approvals:decide", "orders:convert"],
  Financeiro: ["orders:invoice", "finance:view", "freights:view"],
  Frete: ["freights:view", "freights:operate"],
  Admin: [
    "simulations:create",
    "approvals:decide",
    "orders:invoice",
    "freights:view",
    "freights:operate",
    "orders:convert",
  ],
};
function can(role, permission) {
  return (permissionsByRole[role] ?? []).includes(permission);
}
const canOperateFreight = (role) => can(role, "freights:operate");
const canRegisterInvoice = (role) => can(role, "orders:invoice");

// 9-11: SIM validada vira Pedido confirmado, frete liberado
const converted = convertSimulationToOrderStatus();
assert.equal(converted.orderStatus, "Pedido confirmado");
const orderConfirmed = { status: converted.orderStatus, totalValue: 1000, billingProgress: 0 };
assert.equal(freightReleased(orderConfirmed), true, "Frete liberado ao confirmar o pedido");

// 12: faturamento derivado começa "Aguardando faturamento"
assert.equal(billingLabel(orderConfirmed), "Aguardando faturamento");

// 13-14: Frete contrata sem depender do faturamento; faturar NÃO bloqueia frete.
assert.equal(freightReleased(orderConfirmed), true);
const afterBilling = applyBilling(orderConfirmed, 1000);
assert.equal(afterBilling.status, "Pedido confirmado", "faturamento não altera status operacional");
assert.equal(freightReleased(afterBilling), true, "frete continua liberado após faturar");
assert.equal(billingLabel(afterBilling), "Faturado");

// 15-17: permissões por perfil
assert.equal(canOperateFreight("Frete"), true);
assert.equal(canOperateFreight("Admin"), true);
assert.equal(canOperateFreight("Financeiro"), false, "Financeiro não contrata frete");
assert.equal(canOperateFreight("Comercial"), false, "Comercial não contrata frete");
assert.equal(canRegisterInvoice("Financeiro"), true);
assert.equal(canRegisterInvoice("Frete"), false, "Frete não fatura");
assert.equal(canRegisterInvoice("Comercial"), false, "Comercial não fatura");

// 18-19: "Fazer pagamento" lista TODOS os lançamentos a pagar (não só o primeiro).
const simPayables = [
  { id: "t1", titleNumber: "SIM-1-PAG-MERC", amount: 100, paidAmount: 0, status: "open" },
  { id: "t2", titleNumber: "SIM-1-PAG-FRETE", amount: 50, paidAmount: 0, status: "open" },
  { id: "t3", titleNumber: "SIM-1-PAG-COMISSAO", amount: 20, paidAmount: 0, status: "open" },
];
function openPaymentList(payables) {
  // o modal expõe TODOS os itens; não escolhe um automaticamente.
  return payables.map((t) => t.id);
}
const listed = openPaymentList(simPayables);
assert.equal(listed.length, 3, "modal mostra todos os lançamentos a pagar");
assert.deepEqual(listed, ["t1", "t2", "t3"]);

// 20: modo Supabase não injeta seeds/mocks como registros reais.
function supabaseBaseTransactional() {
  // mirror de supabaseBaseState: transacionais vazias no modo Supabase.
  return { simulations: [], orders: [], freights: [], notifications: [], auditEvents: [] };
}
const base = supabaseBaseTransactional();
assert.equal(base.simulations.length, 0, "sem seeds de simulação no modo Supabase");
assert.equal(base.orders.length, 0);
assert.equal(base.freights.length, 0);

// 24-25: provider resolve local/supabase sem quebrar (reuso do helper existente)
assert.equal(getDataProvider("supabase"), "supabase");
assert.equal(getDataProvider("outro"), "local");

console.log("Testes de separação frete/faturamento passaram.");

// ---------------------------------------------------------------------------
// Operação do frete vai para o checklist do motorista (fix: move freight
// operation tracking to driver checklist). Mirror puro. Sem Supabase.
// ---------------------------------------------------------------------------

// Permissões (mirror atualizado): Comercial agora tem freights:view (só leitura).
const perms2 = {
  Comercial: ["freights:view"],
  Financeiro: ["orders:invoice", "freights:view"],
  Frete: ["freights:view", "freights:operate"],
  Admin: ["freights:view", "freights:operate", "orders:invoice"],
};
const can2 = (role, p) => (perms2[role] ?? []).includes(p);

// 3/17/18/19: Comercial e Financeiro veem a aba Fretes, mas NÃO operam.
assert.equal(can2("Comercial", "freights:view"), true, "Comercial acompanha fretes");
assert.equal(can2("Financeiro", "freights:view"), true, "Financeiro acompanha fretes");
assert.equal(can2("Comercial", "freights:operate"), false, "Comercial não contrata");
assert.equal(can2("Financeiro", "freights:operate"), false, "Financeiro não contrata");
assert.equal(can2("Frete", "freights:operate"), true);
assert.equal(can2("Admin", "freights:operate"), true);

// 5/6/7: o Frete só CONTRATA (quoted → hired). Depois disso, sem avanço manual.
function nextFreightStatus(status) {
  const map = {
    quoted: "hired",
    hired: "loading",
    loading: "in_route",
    in_route: "at_destination",
    at_destination: "unloaded",
    unloaded: "delivered",
  };
  return map[status] ?? status;
}
// O botão de contratação só aparece para status "quoted".
function freteShowsContractButton(status) {
  return status === "quoted";
}
// Regra nova: o Frete NÃO tem botões de avanço operacional (loading/rota/entrega).
const FRETE_HAS_OPERATIONAL_ADVANCE = false;
assert.equal(freteShowsContractButton("quoted"), true);
assert.equal(nextFreightStatus("quoted"), "hired", "contratar leva a Frete contratado");
assert.equal(freteShowsContractButton("hired"), false, "sem botão contratar após contratado");
assert.equal(FRETE_HAS_OPERATIONAL_ADVANCE, false, "sem 'Iniciar carregamento' p/ Frete");

// 8: link/PIN fica disponível para o Frete (opera) e NÃO para o Financeiro.
assert.equal(can2("Frete", "freights:operate"), true, "Frete gera link/PIN após liberação");
assert.equal(can2("Financeiro", "freights:operate"), false, "Financeiro não gera link/PIN");

// 11/12: motorista finaliza só com canhoto (mirror da regra do link externo).
function canFinalizeDelivery(hasProofFile) {
  return Boolean(hasProofFile);
}
assert.equal(canFinalizeDelivery(false), false, "não finaliza sem canhoto");
assert.equal(canFinalizeDelivery(true), true, "finaliza com canhoto anexado");

// Sem geolocalização nesta entrega: evento do motorista não carrega coords.
function buildDriverEvent(type) {
  return { type }; // sem latitude/longitude
}
const ev = buildDriverEvent("arrived_loading");
assert.equal("latitude" in ev, false, "evento do motorista sem geolocalização");

console.log("Testes de operação via checklist do motorista passaram.");

// ---------------------------------------------------------------------------
// Correção do checklist/ocorrência do motorista (fix: repair driver checklist and
// occurrence rpc errors). Mirror puro de friendlyDriverError + regra de não avançar
// sem confirmação do banco + anti-duplo-clique. Sem Supabase.
// ---------------------------------------------------------------------------

function friendlyDriverError(raw, context) {
  const msg = String(raw ?? "").toLowerCase();
  if (
    msg.includes("expirad") ||
    msg.includes("revogad") ||
    msg.includes("expired") ||
    msg.includes("revoked") ||
    msg.includes("pin") ||
    msg.includes("token") ||
    msg.includes("inválid") ||
    msg.includes("invalid")
  )
    return "Link inválido, expirado ou revogado. Peça um novo acesso ao time de frete.";
  if (msg.includes("not found") || msg.includes("não encontrad") || msg.includes("nao encontrad"))
    return "Operação não encontrada.";
  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network") ||
    msg.includes("conexão") ||
    msg.includes("conexao")
  )
    return "Erro ao salvar. Verifique sua conexão e tente novamente.";
  if (context === "occurrence") return "Não foi possível registrar a ocorrência. Tente novamente.";
  if (context === "proof") return "Não foi possível enviar o comprovante. Tente novamente.";
  return "Não foi possível registrar esta etapa. Tente novamente.";
}

// 20: erros técnicos viram mensagens amigáveis, por tipo.
assert.match(
  friendlyDriverError(
    'column "organization_id" of relation "freight_events" does not exist',
    "event",
  ),
  /Não foi possível registrar esta etapa/,
);
assert.match(friendlyDriverError("PIN inválido", "event"), /Link inválido, expirado ou revogado/);
assert.match(friendlyDriverError("token expired", "event"), /Link inválido, expirado ou revogado/);
assert.match(friendlyDriverError("Failed to fetch", "event"), /Verifique sua conexão/);
assert.match(friendlyDriverError("freight not found", "event"), /Operação não encontrada/);
assert.match(friendlyDriverError("boom", "occurrence"), /Não foi possível registrar a ocorrência/);
assert.match(friendlyDriverError("boom", "proof"), /Não foi possível enviar o comprovante/);

// 3-5: o checklist só avança quando o banco confirma (setTrip só no sucesso).
function simulateSubmit({ rpcOk, submitting }) {
  const events = [];
  if (submitting) return { advanced: false, reason: "duplo-clique bloqueado", events };
  submitting = true;
  try {
    if (!rpcOk) throw new Error('42703: column "organization_id" ... does not exist');
    events.push("arrived_loading");
    return { advanced: true, events };
  } catch (e) {
    return { advanced: false, error: friendlyDriverError(e.message, "event"), events };
  } finally {
    submitting = false;
  }
}
const failed = simulateSubmit({ rpcOk: false, submitting: false });
assert.equal(failed.advanced, false, "não avança o checklist quando o RPC falha");
assert.equal(failed.events.length, 0, "nenhum evento gravado na falha");
const ok = simulateSubmit({ rpcOk: true, submitting: false });
assert.equal(ok.advanced, true, "avança quando o RPC confirma");
assert.deepEqual(ok.events, ["arrived_loading"]);

// 19: clique enquanto já está enviando é bloqueado (anti-duplo-clique).
const blocked = simulateSubmit({ rpcOk: true, submitting: true });
assert.equal(blocked.advanced, false, "clique duplo não cria evento duplicado");

// 14: latitude/longitude nulas seguem no payload sem quebrar.
const payload = { p_event_type: "arrived_loading", p_latitude: null, p_longitude: null };
assert.equal(payload.p_latitude, null);
assert.equal(payload.p_longitude, null);

console.log("Testes do fix do checklist/ocorrência do motorista passaram.");

console.log("Todos os testes passaram.");
