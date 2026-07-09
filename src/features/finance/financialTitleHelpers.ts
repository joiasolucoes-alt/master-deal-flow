import type {
  ExpenseItem,
  FinancialTitle,
  FinancialTitleStatus,
  FreightRecord,
  Order,
  PurchaseItem,
  Simulation,
} from "@/data/types";
import { getExpenseTotal, getSimulationTotals } from "@/lib/calculations";

const DEFAULT_DUE_DAYS = 28;

export function parseInstallmentDays(paymentTerms: string) {
  const days = paymentTerms
    .match(/\d+/g)
    ?.map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);

  return days?.length ? days : [DEFAULT_DUE_DAYS];
}

export function getFinancialTitleStatus(
  title: FinancialTitle,
  now = new Date(),
): FinancialTitleStatus {
  if (title.status === "cancelled") return "cancelled";
  if (title.paidAmount >= title.amount && title.amount > 0) return "paid";
  if (title.paidAmount > 0) return "partial";

  const dueDate = new Date(title.dueDate);
  if (!Number.isNaN(dueDate.getTime()) && dueDate < startOfDay(now)) return "overdue";

  return "open";
}

export function getStatusLabel(status: FinancialTitleStatus) {
  const labels: Record<FinancialTitleStatus, string> = {
    open: "A vencer",
    partial: "Parcial",
    paid: "Pago",
    overdue: "Vencido",
    cancelled: "Cancelado",
  };
  return labels[status];
}

export function createFinancialTitlesFromOrder(order: Order, now = new Date()) {
  const installmentDays = parseInstallmentDays(order.paymentTerms);
  const installmentAmount = roundCurrency(order.totalValue / installmentDays.length);

  return installmentDays.map((days, index): FinancialTitle => {
    const isLast = index === installmentDays.length - 1;
    const previousTotal = installmentAmount * index;
    const amount = isLast ? roundCurrency(order.totalValue - previousTotal) : installmentAmount;
    const dueDate = addDays(order.date, days);
    const status = getFinancialTitleStatus(
      {
        id: "",
        orderId: order.id,
        orderNumber: order.number,
        client: order.client,
        titleNumber: `${order.number}-PARC-${index + 1}`,
        type: "receivable",
        status: "open",
        dueDate,
        amount,
        paidAmount: 0,
        paymentMethod: order.paymentTerms,
        bankName: "",
        notes: "Título gerado a partir do pedido.",
        owner: order.owner,
        unit: order.unit,
        createdAt: order.date,
      },
      now,
    );

    return {
      id: `fin-${order.id}-${index + 1}`,
      orderId: order.id,
      orderNumber: order.number,
      client: order.client,
      titleNumber: `${order.number}-PARC-${index + 1}`,
      type: "receivable",
      status,
      dueDate,
      amount,
      paidAmount: 0,
      paymentMethod: order.paymentTerms,
      bankName: "",
      notes: "Título gerado a partir do pedido.",
      owner: order.owner,
      unit: order.unit,
      createdAt: order.date,
      paidAt: status === "paid" ? now.toISOString() : undefined,
    };
  });
}

export function createPayableTitlesFromOrder(
  order: Order,
  freights: FreightRecord[] = [],
  now = new Date(),
) {
  const titles: FinancialTitle[] = [];
  const goodsTotal = roundCurrency(
    order.products.reduce((sum, product) => {
      const costTotal = product.costTotal ?? product.quantityTotal * product.costUnit;
      return sum + costTotal;
    }, 0),
  );

  if (goodsTotal > 0) {
    titles.push(
      createPayableTitle({
        id: `pay-${order.id}-goods`,
        order,
        titleNumber: `${order.number}-PAG-MERC`,
        payee: "Fornecedor do pedido",
        amount: goodsTotal,
        dueDate: addDays(order.date, 7),
        notes: "Conta a pagar de mercadoria gerada a partir do pedido.",
        now,
      }),
    );
  }

  freights
    .filter((freight) => freight.orderId === order.id && freight.freightValue > 0)
    .forEach((freight) => {
      titles.push(
        createPayableTitle({
          id: `pay-${order.id}-freight-${freight.id}`,
          order,
          titleNumber: `${order.number}-PAG-FRETE`,
          payee: freight.carrierName || "Transportadora",
          amount: roundCurrency(freight.freightValue),
          dueDate: freight.pickupDate || order.date,
          notes: `Conta a pagar de frete ${freight.code}.`,
          now,
        }),
      );
    });

  return titles;
}

export function createOperationalFinancialTitlesFromSimulationOrder(
  simulation: Simulation,
  order: Order,
  now = new Date(),
) {
  return [
    ...createFinancialTitlesFromOrder(order, now),
    ...createPayableTitlesFromSimulationOrder(simulation, order, now),
  ];
}

export function createPreOrderPayableTitlesFromSimulation(
  simulation: Simulation,
  now = new Date(),
) {
  const titles: FinancialTitle[] = [];
  const purchaseItems = simulation.purchaseItems.filter((item) => item.value > 0);
  const baseDueDate = addDays(simulation.deliveryDate || simulation.createdAt, -1);

  if (purchaseItems.length > 0) {
    purchaseItems.forEach((item, index) => {
      const suffix = normalizeTitleSuffix(item.type || `NF-${index + 1}`);
      titles.push(
        createSimulationPayableTitle({
          id: `prepay-${simulation.id}-purchase-${index + 1}-${suffix}`,
          simulation,
          titleNumber: `${simulation.number}-PAG-${suffix}`,
          payee: item.supplier || simulation.supplier || "Fornecedor da proposta",
          amount: item.value,
          dueDate: baseDueDate,
          notes: `${item.type} ${item.document ? `(${item.document})` : ""} previsto antes da confirmação do pedido.`,
          now,
        }),
      );
    });
  } else {
    titles.push(
      createSimulationPayableTitle({
        id: `prepay-${simulation.id}-goods`,
        simulation,
        titleNumber: `${simulation.number}-PAG-MERC`,
        payee: simulation.supplier || "Fornecedor da proposta",
        amount: getSimulationTotals(simulation).merchandiseCost,
        dueDate: baseDueDate,
        notes: "Pagamento previsto da mercadoria antes da confirmação do pedido.",
        now,
      }),
    );
  }

  createSimulationExpensePayables(simulation, now).forEach((title) => titles.push(title));

  return dedupeFinancialTitles(titles).filter((title) => title.amount > 0);
}

export function getRequiredPayablesForSimulation(
  titles: FinancialTitle[],
  simulationId: string | undefined,
) {
  if (!simulationId) return [];
  return titles.filter(
    (title) =>
      title.simulationId === simulationId &&
      title.type === "payable" &&
      title.status !== "cancelled" &&
      title.amount > 0,
  );
}

export function hasPaymentProof(title: FinancialTitle) {
  return Boolean(title.proofFileName || title.proofFilePath || title.proofAttachedAt);
}

export function areSimulationPayablesPaidWithProof(
  simulation: Simulation,
  titles: FinancialTitle[],
) {
  const requiredPayables = getRequiredPayablesForSimulation(titles, simulation.id);
  if (requiredPayables.length === 0) return false;
  return requiredPayables.every(
    (title) => getFinancialTitleStatus(title) === "paid" && hasPaymentProof(title),
  );
}

export function linkSimulationTitlesToOrder(
  simulation: Simulation,
  order: Order,
  titles: FinancialTitle[],
) {
  return titles.map((title) => {
    if (title.simulationId !== simulation.id) return title;
    return {
      ...title,
      orderId: order.id,
      orderNumber: order.number,
      notes: addUniqueText(title.notes, `Vinculado ao pedido confirmado ${order.number}.`),
    };
  });
}

export function createPayableTitlesFromSimulationOrder(
  simulation: Simulation,
  order: Order,
  now = new Date(),
) {
  const titles: FinancialTitle[] = [];
  const purchaseItems = simulation.purchaseItems.filter((item) => item.value > 0);

  if (purchaseItems.length > 0) {
    purchaseItems.forEach((item, index) => {
      titles.push(createPurchasePayableTitle(simulation, order, item, index, now));
    });
  } else {
    titles.push(
      createPayableTitle({
        id: `pay-${order.id}-goods`,
        order,
        titleNumber: `${order.number}-PAG-MERC`,
        payee: simulation.supplier || "Fornecedor do pedido",
        amount: getSimulationTotals(simulation).merchandiseCost,
        dueDate: addDays(order.date, 7),
        notes: "Pagamento previsto da mercadoria gerado automaticamente na aprovação do pedido.",
        now,
      }),
    );
  }

  createExpensePayables(simulation, order, now).forEach((title) => titles.push(title));

  return dedupeFinancialTitles(titles).filter((title) => title.amount > 0);
}

export function getRequiredPayablesForFreightRelease(
  titles: FinancialTitle[],
  orderId: string | undefined,
) {
  if (!orderId) return [];
  return titles.filter(
    (title) =>
      title.orderId === orderId &&
      title.type === "payable" &&
      title.status !== "cancelled" &&
      title.amount > 0,
  );
}

export function isOrderFinanciallyReleased(order: Order | undefined, titles: FinancialTitle[]) {
  if (!order) return false;
  const requiredPayables = getRequiredPayablesForFreightRelease(titles, order.id);
  if (requiredPayables.length === 0) return false;
  return requiredPayables.every((title) => getFinancialTitleStatus(title) === "paid");
}

export function getFreightReleaseStatusLabel(order: Order | undefined, titles: FinancialTitle[]) {
  if (!order) return "Aguardando pagamento";
  if (order.status === "Entregue") return "Finalizado";
  if (isOrderFinanciallyReleased(order, titles)) return "Liberado para contratação";
  return "Aguardando liberação financeira";
}

export function releaseOrderForFreightIfReady(order: Order, titles: FinancialTitle[]) {
  if (!isOrderFinanciallyReleased(order, titles)) return order;
  if (
    order.status !== "Pedido confirmado" &&
    order.status !== "Frete liberado" &&
    order.status !== "Aguardando faturamento" &&
    order.status !== "Em faturamento" &&
    order.status !== "Aguardando frete"
  ) {
    return order;
  }

  const now = new Date().toISOString();
  const timelineExists = order.timeline.some((event) => event.id === "financial-release");

  return {
    ...order,
    status: "Frete liberado" as const,
    logisticsStatus: "Pagamento validado pelo Comercial. Frete liberado para execução.",
    notes: addUnique(order.notes, "Operação liberada pelo Financeiro e validada pelo Comercial."),
    timeline: timelineExists
      ? order.timeline
      : [
          ...order.timeline,
          {
            id: "financial-release",
            title: "Liberação operacional",
            description: "Pagamento comprovado e validado. Frete liberado para execução.",
            date: now,
            completed: true,
          },
        ],
  };
}

export function calculateBillingProgress(titles: FinancialTitle[], expectedTotal?: number) {
  const receivableTitles = titles.filter(
    (title) => title.type === "receivable" && title.status !== "cancelled",
  );
  const total =
    typeof expectedTotal === "number" && expectedTotal > 0
      ? expectedTotal
      : receivableTitles.reduce((sum, title) => sum + title.amount, 0);
  if (total <= 0) return 0;
  const billed = receivableTitles.reduce((sum, title) => sum + title.amount, 0);
  return Math.min(100, Math.round((billed / total) * 100));
}

function createPayableTitle(payload: {
  id: string;
  order: Order;
  titleNumber: string;
  payee: string;
  amount: number;
  dueDate: string;
  notes: string;
  now: Date;
}): FinancialTitle {
  const title: FinancialTitle = {
    id: payload.id,
    orderId: payload.order.id,
    orderNumber: payload.order.number,
    client: payload.payee,
    titleNumber: payload.titleNumber,
    type: "payable",
    status: "open",
    dueDate: payload.dueDate,
    amount: payload.amount,
    paidAmount: 0,
    paymentMethod: "Transferência",
    bankName: "",
    notes: payload.notes,
    owner: payload.order.owner,
    unit: payload.order.unit,
    createdAt: payload.now.toISOString(),
  };

  return { ...title, status: getFinancialTitleStatus(title, payload.now) };
}

function createSimulationPayableTitle(payload: {
  id: string;
  simulation: Simulation;
  titleNumber: string;
  payee: string;
  amount: number;
  dueDate: string;
  notes: string;
  now: Date;
}): FinancialTitle {
  const title: FinancialTitle = {
    id: payload.id,
    simulationId: payload.simulation.id,
    simulationNumber: payload.simulation.number,
    client: payload.payee,
    titleNumber: payload.titleNumber,
    type: "payable",
    status: "open",
    dueDate: payload.dueDate,
    amount: payload.amount,
    paidAmount: 0,
    paymentMethod: "Transferência",
    bankName: "",
    notes: payload.notes,
    owner: payload.simulation.owner,
    unit: payload.simulation.unit,
    createdAt: payload.now.toISOString(),
  };

  return { ...title, status: getFinancialTitleStatus(title, payload.now) };
}

function createPurchasePayableTitle(
  simulation: Simulation,
  order: Order,
  item: PurchaseItem,
  index: number,
  now: Date,
) {
  const suffix = normalizeTitleSuffix(item.type || `NF-${index + 1}`);
  return createPayableTitle({
    id: `pay-${order.id}-purchase-${index + 1}-${suffix}`,
    order,
    titleNumber: `${order.number}-PAG-${suffix}`,
    payee: item.supplier || simulation.supplier || "Fornecedor do pedido",
    amount: item.value,
    dueDate: addDays(order.date, 7),
    notes: `${item.type} ${item.document ? `(${item.document})` : ""} gerado automaticamente a partir da simulação.`,
    now,
  });
}

function createExpensePayables(simulation: Simulation, order: Order, now: Date) {
  const totals = getSimulationTotals(simulation);
  const bases = {
    revenue: totals.revenue,
    purchaseTotal: totals.purchaseTotal,
    grossProfit: totals.grossProfit,
  };

  return simulation.expenseItems
    .map((expense, index) => {
      const amount = roundCurrency(getExpenseTotal(expense, bases));
      if (amount <= 0) return null;
      const suffix = normalizeExpenseSuffix(expense, index);
      return createPayableTitle({
        id: `pay-${order.id}-expense-${index + 1}-${suffix}`,
        order,
        titleNumber: `${order.number}-PAG-${suffix}`,
        payee: getExpensePayee(expense),
        amount,
        dueDate: addDays(order.date, getExpenseDueDays(expense)),
        notes: `${expense.type} previsto na simulação (${expense.calculationType === "percentage" ? `${expense.value}%` : "valor fixo"}).`,
        now,
      });
    })
    .filter((title): title is FinancialTitle => Boolean(title));
}

function createSimulationExpensePayables(simulation: Simulation, now: Date) {
  const totals = getSimulationTotals(simulation);
  const bases = {
    revenue: totals.revenue,
    purchaseTotal: totals.purchaseTotal,
    grossProfit: totals.grossProfit,
  };
  const baseDueDate = addDays(simulation.deliveryDate || simulation.createdAt, -1);

  return simulation.expenseItems
    .map((expense, index) => {
      const amount = roundCurrency(getExpenseTotal(expense, bases));
      if (amount <= 0) return null;
      const suffix = normalizeExpenseSuffix(expense, index);
      return createSimulationPayableTitle({
        id: `prepay-${simulation.id}-expense-${index + 1}-${suffix}`,
        simulation,
        titleNumber: `${simulation.number}-PAG-${suffix}`,
        payee: getExpensePayee(expense),
        amount,
        dueDate: expense.type === "Comissão" ? addDays(simulation.deliveryDate, 30) : baseDueDate,
        notes: `${expense.type} previsto na proposta antes da confirmação do pedido.`,
        now,
      });
    })
    .filter((title): title is FinancialTitle => Boolean(title));
}

function dedupeFinancialTitles(titles: FinancialTitle[]) {
  const byId = new Map<string, FinancialTitle>();
  titles.forEach((title) => byId.set(title.id, title));
  return Array.from(byId.values());
}

function normalizeExpenseSuffix(expense: ExpenseItem, index: number) {
  return normalizeTitleSuffix(expense.type || `DESP-${index + 1}`);
}

function normalizeTitleSuffix(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toUpperCase() || "OPERACIONAL"
  );
}

function getExpensePayee(expense: ExpenseItem) {
  const payees: Partial<Record<ExpenseItem["type"], string>> = {
    Frete: "Transportadora",
    Comissão: "Comissão comercial",
    "Custo NF": "Custo de NF",
    "Custo fiscal": "Custo fiscal",
    Financeiro: "Financeiro",
    "PIS E COFINS": "Tributos",
    STRINT: "STRINT",
    Tributos: "Tributos",
    Pallets: "Pallets",
    "Chapa/Descarga": "Chapa/Descarga",
    Seguro: "Seguro",
    Outros: "Outros custos",
  };
  return payees[expense.type] ?? expense.type;
}

function getExpenseDueDays(expense: ExpenseItem) {
  if (expense.type === "Frete") return 2;
  if (expense.type === "Comissão") return 30;
  if (expense.type === "Financeiro") return 28;
  return 7;
}

function addDays(baseDate: string, days: number) {
  const date = new Date(baseDate);
  if (Number.isNaN(date.getTime())) date.setTime(Date.now());
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function addUnique(values: string[], value: string) {
  if (values.includes(value)) return values;
  return [...values, value];
}

function addUniqueText(current: string, value: string) {
  if (current.includes(value)) return current;
  return current ? `${current} ${value}` : value;
}

function startOfDay(date: Date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildFreightPayableTitleId(freight: FreightRecord) {
  return `pay-freight-${freight.id}`;
}

export function buildFreightPayableTitle(
  freight: FreightRecord,
  order: Order | undefined,
  existing?: FinancialTitle,
  now = new Date(),
): FinancialTitle | null {
  if (freight.freightValue <= 0) return null;
  const dueDate = freight.freightPaymentDueDate || freight.pickupDate || now.toISOString();
  const id = existing?.id ?? buildFreightPayableTitleId(freight);
  const title: FinancialTitle = {
    id,
    orderId: order?.id,
    orderNumber: order?.number,
    client: freight.carrierName || "Transportadora do frete",
    titleNumber: `${order?.number ?? freight.code}-PAG-FRETE`,
    type: "payable",
    status: existing?.status ?? "open",
    dueDate,
    amount: roundCurrency(freight.freightValue),
    paidAmount: existing?.paidAmount ?? 0,
    paymentMethod: existing?.paymentMethod ?? "Transferência",
    bankName: existing?.bankName ?? "",
    notes: `Frete ${freight.code} — ${freight.route}. Motorista ${freight.driverName || "a definir"} (${freight.vehiclePlate || "placa a definir"}).`,
    owner: freight.owner,
    unit: freight.unit,
    createdAt: existing?.createdAt ?? now.toISOString(),
    paidAt: existing?.paidAt,
    proofFileName: existing?.proofFileName,
    proofFilePath: existing?.proofFilePath,
    proofAttachedAt: existing?.proofAttachedAt,
    proofAttachedBy: existing?.proofAttachedBy,
  };
  return { ...title, status: getFinancialTitleStatus(title, now) };
}

