import type { FinancialTitle, FinancialTitleStatus, FreightRecord, Order } from "@/data/types";

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

function addDays(baseDate: string, days: number) {
  const date = new Date(baseDate);
  if (Number.isNaN(date.getTime())) date.setTime(Date.now());
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function startOfDay(date: Date) {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
