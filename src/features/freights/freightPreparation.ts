import type { FinancialTitle, FreightRecord, Order } from "@/data/types";
import { isOrderFinanciallyReleased } from "@/features/finance/financialTitleHelpers";

/**
 * Regras de "preparação logística" do frete.
 *
 * Quando o Gestor aprova a simulação, um registro de frete é criado como
 * "operação futura" (sem `orderId`), para que o time de Frete/Logística já
 * enxergue a carga e comece a se organizar. Enquanto a proposta não virar
 * pedido e não for liberada financeiramente, esse frete fica BLOQUEADO para
 * execução: nada de contratar oficialmente, gerar link/PIN do motorista,
 * carregar, rodar ou finalizar entrega.
 *
 * Este módulo centraliza (de forma pura e testável) a classificação do frete
 * em "baldes" para a tela e o gate de execução, reutilizado pela UI.
 */

export type FreightBucket = "preparation" | "released" | "in_progress" | "finished";

/**
 * Um frete está em preparação enquanto NÃO estiver vinculado a um pedido
 * (proposta aprovada pelo Gestor, aguardando pagamento e validação comercial).
 */
export function isPreparationFreight(freight: FreightRecord): boolean {
  return !freight.orderId;
}

/**
 * "Operação futura": a proposta ainda não virou pedido. Usado para deixar claro
 * na UI que o frete é apenas para preparação e não pode ser executado.
 */
export function isFutureOperation(freight: FreightRecord): boolean {
  return !freight.orderId;
}

/**
 * A execução do frete (contratar, gerar link/PIN, carregar, rodar, finalizar)
 * só é liberada quando o pedido existe E está financeiramente liberado
 * (faturado/liberado, conforme a regra vigente de faturamento).
 */
export function canExecuteFreight(
  freight: FreightRecord,
  order: Order | undefined,
  titles: FinancialTitle[],
): boolean {
  if (isPreparationFreight(freight)) return false;
  return isOrderFinanciallyReleased(order, titles);
}

/**
 * O link/PIN do motorista NUNCA pode ser gerado antes da liberação operacional.
 * (Os demais gates de documentos continuam sendo aplicados na própria tela.)
 */
export function canGenerateDriverLink(
  freight: FreightRecord,
  order: Order | undefined,
  titles: FinancialTitle[],
): boolean {
  return canExecuteFreight(freight, order, titles);
}

export function getFreightBucket(
  freight: FreightRecord,
  order: Order | undefined,
  titles: FinancialTitle[],
): FreightBucket {
  if (freight.status === "delivered" || freight.status === "cancelled") return "finished";
  if (freight.status === "loading" || freight.status === "in_route") return "in_progress";
  if (canExecuteFreight(freight, order, titles)) return "released";
  return "preparation";
}

export const FREIGHT_BUCKET_LABEL: Record<FreightBucket, string> = {
  preparation: "Preparação",
  released: "Liberados",
  in_progress: "Em andamento",
  finished: "Finalizados",
};

/**
 * Rótulo curto do estágio de preparação, deixando explícito por que o frete
 * ainda está bloqueado para execução.
 */
export function getPreparationStageLabel(freight: FreightRecord, order: Order | undefined): string {
  if (!freight.orderId || !order) {
    return "Em preparação • aguardando pagamento";
  }
  return "Em preparação • aguardando faturamento";
}

/** Mensagem de bloqueio de execução para a preparação. */
export function getPreparationBlockedReason(
  freight: FreightRecord,
  order: Order | undefined,
): string {
  if (!freight.orderId || !order) {
    return "Operação em preparação: ainda não virou pedido. Bloqueada para execução até o pagamento, a validação comercial e a criação do pedido.";
  }
  return "Pedido criado, aguardando faturamento/NF. Bloqueada para execução até a liberação financeira.";
}
