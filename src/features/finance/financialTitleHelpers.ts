import type { FinancialTitle, FinancialTitleStatus, Order } from "@/data/types";

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
    const paidAmount = roundCurrency((amount * order.billingProgress) / 100);
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
        paidAmount,
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
      paidAmount,
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

export function calculateBillingProgress(titles: FinancialTitle[]) {
  const total = titles.reduce((sum, title) => sum + title.amount, 0);
  if (total <= 0) return 0;
  const paid = titles.reduce((sum, title) => sum + Math.min(title.paidAmount, title.amount), 0);
  return Math.min(100, Math.round((paid / total) * 100));
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
