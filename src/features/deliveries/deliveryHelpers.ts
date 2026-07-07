import type { DeliveryRecord, DeliveryStatus, FreightRecord, Order } from "@/data/types";

const DELIVERY_PROGRESS_BY_STATUS: Record<DeliveryStatus, number> = {
  pending: 0,
  loading: 25,
  loaded: 45,
  in_route: 70,
  arrived: 90,
  delivered: 100,
  issue: 70,
  cancelled: 0,
};

export function createDeliveryFromFreight(freight: FreightRecord): DeliveryRecord {
  const status = getInitialDeliveryStatus(freight);

  return {
    id: `delivery-${freight.id}`,
    orderId: freight.orderId,
    orderNumber: freight.orderNumber,
    freightId: freight.id,
    freightCode: freight.code,
    client: freight.client,
    route: freight.route,
    status,
    currentLocation: getCurrentLocationFromFreight(freight),
    expectedDeliveryDate: freight.expectedDeliveryDate,
    deliveredAt:
      status === "delivered" ? (freight.deliveredAt ?? new Date().toISOString()) : undefined,
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
    owner: freight.owner,
    unit: freight.unit,
    createdAt: new Date().toISOString(),
  };
}

export function getDeliveryStatusLabel(status: DeliveryStatus) {
  const labels: Record<DeliveryStatus, string> = {
    pending: "Pendente",
    loading: "Carregando",
    loaded: "Carregado",
    in_route: "Em rota",
    arrived: "No destino",
    delivered: "Entregue",
    issue: "Ocorrência",
    cancelled: "Cancelado",
  };
  return labels[status];
}

export function getNextDeliveryStatus(status: DeliveryStatus): DeliveryStatus {
  const next: Record<DeliveryStatus, DeliveryStatus> = {
    pending: "loading",
    loading: "loaded",
    loaded: "in_route",
    in_route: "arrived",
    arrived: "delivered",
    delivered: "delivered",
    issue: "in_route",
    cancelled: "cancelled",
  };
  return next[status];
}

export function getDeliveryProgress(status: DeliveryStatus) {
  return DELIVERY_PROGRESS_BY_STATUS[status];
}

export function updateOrderFromDelivery(order: Order, delivery: DeliveryRecord): Order {
  const deliveryProgress = Math.max(order.deliveryProgress, getDeliveryProgress(delivery.status));
  const status =
    delivery.status === "delivered"
      ? "Entregue"
      : delivery.status === "in_route" ||
          delivery.status === "arrived" ||
          delivery.status === "issue"
        ? "Em rota"
        : order.status;

  return {
    ...order,
    status,
    deliveryProgress,
    logisticsStatus: getOrderLogisticsStatus(delivery),
    timeline: upsertTimeline(order, delivery),
  };
}

function getInitialDeliveryStatus(freight: FreightRecord): DeliveryStatus {
  if (freight.status === "delivered") return "delivered";
  if (freight.status === "in_route") return "in_route";
  if (freight.status === "loading") return "loading";
  return "pending";
}

function getCurrentLocationFromFreight(freight: FreightRecord) {
  if (freight.status === "delivered") return "Entrega concluída";
  if (freight.status === "in_route") return "Em trânsito";
  if (freight.status === "loading") return "Unidade de carregamento";
  return "Aguardando expedição";
}

function getOrderLogisticsStatus(delivery: DeliveryRecord) {
  if (delivery.status === "delivered") {
    return delivery.proofRegisteredAt
      ? "Entrega concluída com canhoto registrado."
      : "Entrega concluída; comprovante pendente.";
  }
  if (delivery.status === "arrived") return "Entrega chegou ao destino.";
  if (delivery.status === "in_route") return "Entrega em rota.";
  if (delivery.status === "loaded") return "Carga carregada e aguardando saída.";
  if (delivery.status === "loading") return "Carga em carregamento.";
  if (delivery.status === "issue")
    return `Ocorrência na entrega: ${getLatestOccurrenceDescription(delivery)}.`;
  if (delivery.status === "cancelled") return "Entrega cancelada.";
  return "Entrega pendente.";
}

function getLatestOccurrenceDescription(delivery: DeliveryRecord) {
  const latest = delivery.occurrences?.at(-1);
  return latest?.description || delivery.occurrenceNotes || "sem detalhe";
}

function upsertTimeline(order: Order, delivery: DeliveryRecord) {
  const eventId = `delivery-${delivery.status}`;
  const exists = order.timeline.some((event) => event.id === eventId);
  if (exists) return order.timeline;

  return [
    ...order.timeline,
    {
      id: eventId,
      title: getDeliveryStatusLabel(delivery.status),
      description: getOrderLogisticsStatus(delivery),
      date: new Date().toISOString(),
      completed: delivery.status !== "pending" && delivery.status !== "cancelled",
    },
  ];
}
