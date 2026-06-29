import type { Order, SimulationProduct } from "@/data/types";

export interface OrderRepository {
  list(): Promise<Order[]>;
  getById(id: string): Promise<Order | null>;
  save(order: Order): Promise<Order>;
  findBySimulationId(simulationId: string): Promise<Order | null>;
}

export type OrderRow = {
  id?: string;
  external_id?: string | null;
  number: string;
  simulation_external_id?: string | null;
  client_name?: string | null;
  responsible_name?: string | null;
  unit_name?: string | null;
  status?: string | null;
  priority?: string | null;
  origin?: string | null;
  destination?: string | null;
  total_value?: number | null;
  goods_total?: number | null;
  billing_progress?: number | null;
  delivery_progress?: number | null;
  payment_terms?: string | null;
  logistics_status?: string | null;
  documents?: string[] | null;
  notes?: string[] | null;
  timeline?: Order["timeline"] | null;
  expected_delivery_date?: string | null;
  created_at?: string | null;
  order_items?: OrderItemRow[];
};

export type OrderItemRow = {
  external_id?: string | null;
  product_code?: string | null;
  product_description?: string | null;
  boxes_quantity?: number | null;
  units_per_box?: number | null;
  total_units?: number | null;
  unit_price?: number | null;
  total_value?: number | null;
};

function toNumber(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toDateTime(value: string | null | undefined) {
  return value || new Date().toISOString();
}

export function orderToRow(order: Order): Record<string, unknown> {
  const goodsTotal = order.products.reduce((sum, product) => {
    return sum + (product.costTotal ?? product.quantityTotal * product.costUnit);
  }, 0);

  return {
    external_id: order.id,
    number: order.number,
    simulation_external_id: order.simulationId ?? null,
    client_name: order.client,
    responsible_name: order.owner,
    unit_name: order.unit,
    status: order.status,
    priority: order.priority,
    origin: order.origin,
    destination: order.destination,
    total_value: order.totalValue,
    goods_total: goodsTotal,
    billing_progress: order.billingProgress,
    delivery_progress: order.deliveryProgress,
    payment_terms: order.paymentTerms,
    logistics_status: order.logisticsStatus,
    documents: order.documents,
    notes: order.notes,
    timeline: order.timeline,
    expected_delivery_date: order.expectedDelivery.slice(0, 10),
    created_at: order.date,
  };
}

export function productToOrderItemRow(
  product: SimulationProduct,
  orderId: string,
): Record<string, unknown> {
  return {
    external_id: product.id,
    order_id: orderId,
    product_code: product.code,
    product_description: product.product,
    boxes_quantity: product.boxes,
    units_per_box: product.unitsPerBox,
    total_units: product.quantityTotal,
    unit_price: product.saleUnit,
    total_value: product.saleTotal ?? product.quantityTotal * product.saleUnit,
  };
}

export function rowToOrder(row: OrderRow): Order {
  return {
    id: row.external_id || row.id || row.number,
    number: row.number,
    simulationId: row.simulation_external_id ?? undefined,
    client: row.client_name || "",
    origin: row.origin || "",
    destination: row.destination || "",
    owner: row.responsible_name || "",
    unit: row.unit_name || "",
    date: toDateTime(row.created_at),
    expectedDelivery: row.expected_delivery_date || toDateTime(row.created_at),
    totalValue: toNumber(row.total_value),
    status: (row.status || "Aguardando faturamento") as Order["status"],
    priority: (row.priority || "Média") as Order["priority"],
    products: (row.order_items ?? []).map(rowToProduct),
    billingProgress: toNumber(row.billing_progress),
    deliveryProgress: toNumber(row.delivery_progress),
    paymentTerms: row.payment_terms || "",
    logisticsStatus: row.logistics_status || "",
    documents: row.documents ?? [],
    notes: row.notes ?? [],
    timeline: row.timeline ?? [],
  };
}

function rowToProduct(row: OrderItemRow): SimulationProduct {
  return {
    id: row.external_id || crypto.randomUUID(),
    code: row.product_code || "",
    product: row.product_description || "",
    boxes: toNumber(row.boxes_quantity),
    unitsPerBox: toNumber(row.units_per_box),
    quantityTotal: toNumber(row.total_units),
    costUnit: 0,
    saleUnit: toNumber(row.unit_price),
    saleTotal: row.total_value ?? undefined,
  };
}
