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
  if (!isSimulationFullyApproved(simulation)) {
    throw new Error("Simulação precisa das aprovações financeira e final antes de virar pedido.");
  }
  const existing = existingOrders.find((o) => o.simulationId === simulation.id);
  if (existing) throw new Error(`Simulação já convertida no pedido ${existing.number}.`);
  const totals = getSimulationTotals(simulation);
  const orderId = `ord-${Date.now()}`;
  const createdAt = nowIso();
  const order: Order = {
    id: orderId,
    number: nextId("PED"),
    simulationId: simulation.id,
    client: simulation.client,
    origin: `${simulation.unit}`,
    destination: `${simulation.deliveryCity} • ${simulation.deliveryState}`,
    owner: simulation.owner,
    unit: simulation.unit,
    date: createdAt,
    expectedDelivery: simulation.deliveryDate,
    totalValue: totals.revenue,
    status: "Aguardando faturamento",
    priority: simulation.priority,
    products: simulation.products,
    billingProgress: 0,
    deliveryProgress: 0,
    paymentTerms: simulation.paymentCondition,
    logisticsStatus: "Pedido criado a partir de simulação aprovada.",
    documents: ["Pedido interno"],
    notes: [`Origem: conversão da simulação ${simulation.number}.`],
    timeline: [
      {
        id: `tl-${Date.now()}`,
        title: "Pedido criado",
        description: "Conversão da simulação aprovada.",
        date: createdAt,
        completed: true,
      },
    ],
  };
  return {
    order,
    simulation: { ...simulation, orderId, convertedAt: createdAt },
    audit: audit(
      "order",
      orderId,
      "converted",
      `Pedido ${order.number} criado a partir da simulação ${simulation.number}.`,
      userId,
      { simulationId: simulation.id },
    ),
  };
}
