import type { FreightRecord, FreightStatus } from "@/data/types";

export interface FreightRepository {
  list(): Promise<FreightRecord[]>;
  save(freight: FreightRecord): Promise<FreightRecord>;
}

export type FreightRow = {
  id?: string;
  external_id?: string | null;
  code?: string | null;
  order_external_id?: string | null;
  order_number?: string | null;
  client_name?: string | null;
  carrier_name?: string | null;
  driver_name?: string | null;
  vehicle_description?: string | null;
  vehicle_plate?: string | null;
  route?: string | null;
  freight_value?: number | null;
  weight_label?: string | null;
  status?: string | null;
  pickup_date?: string | null;
  expected_delivery_date?: string | null;
  owner_name?: string | null;
  unit_name?: string | null;
  notes?: string | null;
  created_at?: string | null;
  delivered_at?: string | null;
};

function toNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeStatus(status?: string | null): FreightStatus {
  if (
    status === "hired" ||
    status === "loading" ||
    status === "in_route" ||
    status === "delivered" ||
    status === "cancelled"
  ) {
    return status;
  }
  return "quoted";
}

export function freightToRow(freight: FreightRecord): Record<string, unknown> {
  return {
    external_id: freight.id,
    code: freight.code,
    order_external_id: freight.orderId ?? null,
    order_number: freight.orderNumber ?? null,
    client_name: freight.client,
    carrier_name: freight.carrierName,
    driver_name: freight.driverName || null,
    vehicle_description: freight.vehicleDescription,
    vehicle_plate: freight.vehiclePlate || null,
    route: freight.route,
    freight_value: freight.freightValue,
    weight_label: freight.weight,
    status: freight.status,
    pickup_date: freight.pickupDate,
    expected_delivery_date: freight.expectedDeliveryDate,
    owner_name: freight.owner,
    unit_name: freight.unit,
    notes: freight.notes || null,
    created_at: freight.createdAt,
    delivered_at: freight.deliveredAt ?? null,
  };
}

export function rowToFreight(row: FreightRow): FreightRecord {
  return {
    id: row.external_id || row.id || row.code || crypto.randomUUID(),
    code: row.code || "",
    orderId: row.order_external_id ?? undefined,
    orderNumber: row.order_number ?? undefined,
    client: row.client_name || "",
    carrierName: row.carrier_name || "",
    driverName: row.driver_name || "",
    vehicleDescription: row.vehicle_description || "",
    vehiclePlate: row.vehicle_plate || "",
    route: row.route || "",
    freightValue: toNumber(row.freight_value),
    weight: row.weight_label || "",
    status: normalizeStatus(row.status),
    pickupDate: row.pickup_date || new Date().toISOString(),
    expectedDeliveryDate: row.expected_delivery_date || new Date().toISOString(),
    owner: row.owner_name || "",
    unit: row.unit_name || "",
    notes: row.notes || "",
    createdAt: row.created_at || new Date().toISOString(),
    deliveredAt: row.delivered_at ?? undefined,
  };
}
