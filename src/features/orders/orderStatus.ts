import type { FinancialTitle, Order } from "@/data/types";
import {
  getFreightReleaseStatusLabel,
  isOrderFinanciallyReleased,
} from "@/features/finance/financialTitleHelpers";

/**
 * Status separados por área (fix: separate freight release from financial invoicing).
 *
 * Um mesmo Pedido tem, ao mesmo tempo, dimensões independentes:
 * - GERAL/operacional  -> order.status ("Pedido confirmado" → "Em rota" → "Entregue").
 * - FRETE              -> liberado assim que o pedido é confirmado (não depende de NF).
 * - FATURAMENTO        -> frente paralela do Financeiro, derivada do billingProgress.
 *
 * O faturamento NÃO bloqueia o frete: é apenas informação de acompanhamento.
 */

export type OrderBillingStatus = "pending" | "partial" | "invoiced";

/** Rótulo do status GERAL do pedido (operacional). */
export function getOrderGeneralLabel(order: Order): string {
  // Enquanto o frete não progride, o pedido é apresentado como "Pedido confirmado".
  if (order.status === "Frete liberado") return "Pedido confirmado";
  return order.status;
}

/** Status de FATURAMENTO derivado (não altera o status operacional). */
export function getOrderBillingStatus(order: Order): OrderBillingStatus {
  if (order.billingProgress >= 100) return "invoiced";
  if (order.billingProgress > 0 || order.invoiceNumber) return "partial";
  return "pending";
}

export function getOrderBillingLabel(order: Order): string {
  switch (getOrderBillingStatus(order)) {
    case "invoiced":
      return "Faturado";
    case "partial":
      return "Faturamento parcial";
    default:
      return "Aguardando faturamento";
  }
}

/**
 * Rótulo do status de FRETE (liberação para contratação). Reaproveita a regra
 * financeira, que já trata "Pedido confirmado" como liberado.
 */
export function getOrderFreightLabel(order: Order | undefined, titles: FinancialTitle[]): string {
  return getFreightReleaseStatusLabel(order, titles);
}

/** O frete já pode ser contratado? (não depende de faturamento). */
export function isFreightReleasedForOrder(
  order: Order | undefined,
  titles: FinancialTitle[],
): boolean {
  return isOrderFinanciallyReleased(order, titles);
}
