import type { Order, Simulation } from "@/data/types";
import type { AuditEvent } from "@/store/types";
import { getSimulationTotals } from "@/lib/calculations";
import { isSimulationFullyApproved } from "@/features/approvals/approvalFlow";

export function nowIso() {
  return new Date().toISOString();
}
export function nextId(prefix: "SIM" | "PED") {
  return `${prefix}-2026-${String(Math.floor(Date.now() % 10000)).padStart(4, "0")}`;
}

export function getOrderNumberFromSimulation(simulationNumber: string) {
  const currentYear = new Date().getFullYear();
  const match = simulationNumber.match(/(?:SIM|PED)-(\d{4})-(\d+)/i);
  if (match) return `PED-${match[1]}-${match[2].padStart(4, "0")}`;

  const numericGroups = simulationNumber.match(/\d+/g);
  const suffix = numericGroups?.at(-1);
  return `PED-${currentYear}-${String(suffix ?? Math.floor(Date.now() % 10000)).padStart(4, "0")}`;
}
export function audit(
  entityType: AuditEvent["entityType"],
  entityId: string,
  action: string,
  description: string,
  userId: string,
  metadata?: Record<string, unknown>,
): AuditEvent {
  return {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    entityType,
    entityId,
    action,
    description,
    userId,
    createdAt: nowIso(),
    metadata,
  };
}
export function duplicateSimulation(
  simulation: Simulation,
  userId: string,
): { simulation: Simulation; audit: AuditEvent } {
  const id = `sim-${Date.now()}`;
  const copy: Simulation = {
    ...simulation,
    id,
    number: nextId("SIM"),
    status: "Rascunho",
    createdAt: nowIso(),
    validUntil: new Date(Date.now() + 15 * 86400000).toISOString(),
    approvalChecklist: undefined,
    approvalFlow: undefined,
    approvalNotes: undefined,
    paymentRequestedAt: undefined,
    paymentPaidAt: undefined,
    paymentPaidBy: undefined,
    paymentReceiptFileName: undefined,
    paymentReceiptFilePath: undefined,
    paymentReceiptAttachedAt: undefined,
    paymentReceiptAttachedBy: undefined,
    paymentValidationNotes: undefined,
    paymentValidatedAt: undefined,
    paymentValidatedBy: undefined,
    paymentAdjustmentReason: undefined,
    orderId: undefined,
    convertedAt: undefined,
  };
  return {
    simulation: copy,
    audit: audit(
      "simulation",
      id,
      "duplicated",
      `Simulação duplicada de ${simulation.number}.`,
      userId,
      { sourceId: simulation.id },
    ),
  };
}
export function convertSimulationToOrder(
  simulation: Simulation,
  existingOrders: Order[],
  userId: string,
): { order: Order; simulation: Simulation; audit: AuditEvent } {
  if (!canConfirmSimulationAsOrder(simulation)) {
    throw new Error(
      "Proposta precisa da aprovação do Gestor, pagamento com comprovante e validação comercial antes de virar pedido.",
    );
  }
  const existing = existingOrders.find((o) => o.simulationId === simulation.id);
  if (existing) throw new Error(`Simulação já convertida no pedido ${existing.number}.`);
  const totals = getSimulationTotals(simulation);
  const orderId = `ord-${Date.now()}`;
  const createdAt = nowIso();
  const order: Order = {
    id: orderId,
    number: getOrderNumberFromSimulation(simulation.number),
    simulationId: simulation.id,
    client: simulation.client,
    origin: `${simulation.unit}`,
    destination: `${simulation.deliveryCity} • ${simulation.deliveryState}`,
    owner: simulation.owner,
    unit: simulation.unit,
    date: createdAt,
    expectedDelivery: simulation.deliveryDate,
    totalValue: totals.revenue,
    // Regra: após a validação comercial do comprovante, o pedido NÃO nasce liberado.
    // Ele nasce aguardando o registro de faturamento/NF pelo Financeiro/Faturamento.
    status: "Aguardando faturamento",
    priority: simulation.priority,
    products: simulation.products,
    billingProgress: 0,
    deliveryProgress: 0,
    paymentTerms: simulation.paymentCondition,
    logisticsStatus:
      "Pagamento validado pelo Comercial. Aguardando registro de faturamento/NF pelo Financeiro.",
    documents: ["Pedido interno"],
    notes: [`Origem: conversão da simulação ${simulation.number}.`],
    timeline: [
      {
        id: `tl-${Date.now()}`,
        title: "Pedido criado",
        description: "Pagamento validado pelo Comercial. Aguardando registro de faturamento/NF.",
        date: createdAt,
        completed: true,
      },
    ],
  };
  return {
    order,
    simulation: {
      ...simulation,
      status: "Pedido confirmado",
      orderId,
      convertedAt: createdAt,
      paymentValidatedAt: simulation.paymentValidatedAt ?? createdAt,
    },
    audit: audit(
      "order",
      orderId,
      "converted",
      `Pedido ${order.number} confirmado a partir da proposta ${simulation.number}.`,
      userId,
      { simulationId: simulation.id },
    ),
  };
}

export function canConfirmSimulationAsOrder(simulation: Simulation) {
  return (
    isSimulationFullyApproved(simulation) &&
    simulation.status === "Aguardando validação comercial" &&
    Boolean(simulation.paymentPaidAt) &&
    Boolean(simulation.paymentReceiptFileName || simulation.paymentReceiptFilePath)
  );
}
