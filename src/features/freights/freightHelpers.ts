import type { FreightRecord, FreightStatus, Order } from "@/data/types";

const FREIGHT_PROGRESS_BY_STATUS: Record<FreightStatus, number> = {
  quoted: 0,
  hired: 15,
  loading: 35,
  in_route: 70,
  delivered: 100,
  cancelled: 0,
};

export function createFreightFromOrder(order: Order): FreightRecord {
  const units = order.products.reduce((sum, product) => sum + product.quantityTotal, 0);
  const status = getInitialFreightStatus(order);

  return {
    id: `freight-${order.id}`,
    code: `FR-${order.number.replace(/\D/g, "").slice(-6) || order.id.slice(-6)}`,
    orderId: order.id,
    orderNumber: order.number,
    client: order.client,
    carrierName: "Transportadora a definir",
    driverName: "",
    vehicleDescription: "Veículo a definir",
    vehiclePlate: "",
    route: `${order.origin} → ${order.destination}`,
    freightValue: 0,
    weight: units > 0 ? `${units.toLocaleString("pt-BR")} un` : "A definir",
    status,
    pickupDate: new Date().toISOString(),
    expectedDeliveryDate: order.expectedDelivery,
    owner: order.owner,
    unit: order.unit,
    notes: "Frete gerado a partir do pedido.",
    createdAt: new Date().toISOString(),
    deliveredAt: status === "delivered" ? new Date().toISOString() : undefined,
  };
}

export function getFreightStatusLabel(status: FreightStatus) {
  const labels: Record<FreightStatus, string> = {
    quoted: "Cotação",
    hired: "Contratado",
    loading: "Carregando",
    in_route: "Em rota",
    delivered: "Entregue",
    cancelled: "Cancelado",
  };
  return labels[status];
}

export function getNextFreightStatus(status: FreightStatus): FreightStatus {
  const next: Record<FreightStatus, FreightStatus> = {
    quoted: "hired",
    hired: "loading",
    loading: "in_route",
    in_route: "delivered",
    delivered: "delivered",
    cancelled: "cancelled",
  };
  return next[status];
}

export function updateOrderFromFreight(order: Order, freight: FreightRecord): Order {
  const deliveryProgress = Math.max(
    order.deliveryProgress,
    FREIGHT_PROGRESS_BY_STATUS[freight.status],
  );
  const status =
    freight.status === "delivered"
      ? "Entregue"
      : freight.status === "in_route"
        ? "Em rota"
        : order.status === "Aguardando faturamento" || order.status === "Em faturamento"
          ? order.status
          : "Aguardando frete";

  return {
    ...order,
    status,
    deliveryProgress,
    logisticsStatus: getOrderLogisticsStatus(freight),
    timeline: upsertTimeline(order, freight),
  };
}

function getInitialFreightStatus(order: Order): FreightStatus {
  if (order.status === "Entregue") return "delivered";
  if (order.status === "Em rota") return "in_route";
  if (order.status === "Aguardando frete" || order.status === "Em separação") return "hired";
  return "quoted";
}

function getOrderLogisticsStatus(freight: FreightRecord) {
  if (freight.status === "delivered") return "Entrega concluída pelo fluxo de frete.";
  if (freight.status === "in_route") return "Frete em rota para entrega.";
  if (freight.status === "loading") return "Frete em carregamento.";
  if (freight.status === "hired") return "Frete contratado e aguardando carregamento.";
  if (freight.status === "cancelled") return "Frete cancelado.";
  return "Frete em cotação.";
}

function upsertTimeline(order: Order, freight: FreightRecord) {
  const eventId = `freight-${freight.status}`;
  const exists = order.timeline.some((event) => event.id === eventId);
  if (exists) return order.timeline;

  return [
    ...order.timeline,
    {
      id: eventId,
      title: getFreightStatusLabel(freight.status),
      description: getOrderLogisticsStatus(freight),
      date: new Date().toISOString(),
      completed: freight.status !== "quoted" && freight.status !== "cancelled",
    },
  ];
}
