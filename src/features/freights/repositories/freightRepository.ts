import type {
  FreightCargoType,
  FreightDriverEmploymentType,
  FreightRecord,
  FreightStatus,
} from "@/data/types";

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
  carrier_document?: string | null;
  driver_name?: string | null;
  driver_cpf?: string | null;
  driver_phone?: string | null;
  driver_employment_type?: string | null;
  vehicle_description?: string | null;
  vehicle_plate?: string | null;
  trailer_plate?: string | null;
  antt_registration?: string | null;
  route?: string | null;
  freight_value?: number | null;
  weight_label?: string | null;
  status?: string | null;
  cargo_type?: string | null;
  pickup_date?: string | null;
  expected_delivery_date?: string | null;
  freight_payment_due_date?: string | null;
  freight_payment_title_id?: string | null;
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
  if (status === "contracted" || status === "arrived_pickup") return "hired";
  if (status === "loaded") return "loading";
  if (status === "in_transit") return "in_route";
  if (status === "completed") return "delivered";
  if (
    status === "quoted" ||
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

function normalizeCargoType(value?: string | null): FreightCargoType | undefined {
  if (
    value === "comum" ||
    value === "perigosa" ||
    value === "refrigerada" ||
    value === "excesso" ||
    value === "rastreada"
  )
    return value;
  return undefined;
}

function normalizeEmployment(value?: string | null): FreightDriverEmploymentType | undefined {
  if (value === "autonomo" || value === "transportadora") return value;
  return undefined;
}

export function freightToRow(freight: FreightRecord): Record<string, unknown> {
  return {
    external_id: freight.id,
    code: freight.code,
    order_external_id: freight.orderId ?? null,
    order_number: freight.orderNumber ?? null,
    client_name: freight.client,
    carrier_name: freight.carrierName,
    carrier_document: freight.carrierDocument ?? null,
    driver_name: freight.driverName || null,
    driver_cpf: freight.driverCpf ?? null,
    driver_phone: freight.driverPhone ?? null,
    driver_employment_type: freight.driverEmploymentType ?? null,
    vehicle_description: freight.vehicleDescription,
    vehicle_plate: freight.vehiclePlate || null,
    trailer_plate: freight.trailerPlate ?? null,
    antt_registration: freight.anttRegistration ?? null,
    route: freight.route,
    freight_value: freight.freightValue,
    weight_label: freight.weight,
    status: freight.status,
    cargo_type: freight.cargoType ?? null,
    pickup_date: freight.pickupDate,
    expected_delivery_date: freight.expectedDeliveryDate,
    freight_payment_due_date: freight.freightPaymentDueDate ?? null,
    freight_payment_title_id: freight.freightPaymentTitleId ?? null,
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
    carrierDocument: row.carrier_document ?? undefined,
    driverName: row.driver_name || "",
    driverCpf: row.driver_cpf ?? undefined,
    driverPhone: row.driver_phone ?? undefined,
    driverEmploymentType: normalizeEmployment(row.driver_employment_type),
    vehicleDescription: row.vehicle_description || "",
    vehiclePlate: row.vehicle_plate || "",
    trailerPlate: row.trailer_plate ?? undefined,
    anttRegistration: row.antt_registration ?? undefined,
    route: row.route || "",
    freightValue: toNumber(row.freight_value),
    weight: row.weight_label || "",
    status: normalizeStatus(row.status),
    cargoType: normalizeCargoType(row.cargo_type),
    pickupDate: row.pickup_date || new Date().toISOString(),
    expectedDeliveryDate: row.expected_delivery_date || new Date().toISOString(),
    freightPaymentDueDate: row.freight_payment_due_date ?? undefined,
    freightPaymentTitleId: row.freight_payment_title_id ?? undefined,
    owner: row.owner_name || "",
    unit: row.unit_name || "",
    notes: row.notes || "",
    createdAt: row.created_at || new Date().toISOString(),
    deliveredAt: row.delivered_at ?? undefined,
  };
}
