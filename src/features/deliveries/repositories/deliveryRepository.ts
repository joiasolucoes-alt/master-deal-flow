import type { DeliveryOccurrence, DeliveryRecord, DeliveryStatus } from "@/data/types";

export interface DeliveryRepository {
  list(): Promise<DeliveryRecord[]>;
  save(delivery: DeliveryRecord): Promise<DeliveryRecord>;
}

export type DeliveryRow = {
  id?: string;
  external_id?: string | null;
  order_external_id?: string | null;
  order_number?: string | null;
  freight_external_id?: string | null;
  freight_code?: string | null;
  client_name?: string | null;
  route?: string | null;
  status?: string | null;
  current_location?: string | null;
  expected_delivery_date?: string | null;
  delivered_at?: string | null;
  proof_notes?: string | null;
  proof_document_number?: string | null;
  proof_file_name?: string | null;
  proof_received_by?: string | null;
  proof_registered_at?: string | null;
  occurrence_notes?: string | null;
  occurrence_history?: unknown;
  owner_name?: string | null;
  unit_name?: string | null;
  created_at?: string | null;
};

function normalizeStatus(status?: string | null): DeliveryStatus {
  if (
    status === "loading" ||
    status === "loaded" ||
    status === "in_route" ||
    status === "arrived" ||
    status === "delivered" ||
    status === "issue" ||
    status === "cancelled"
  ) {
    return status;
  }
  return "pending";
}

export function deliveryToRow(delivery: DeliveryRecord): Record<string, unknown> {
  return {
    external_id: delivery.id,
    order_external_id: delivery.orderId ?? null,
    order_number: delivery.orderNumber ?? null,
    freight_external_id: delivery.freightId ?? null,
    freight_code: delivery.freightCode ?? null,
    client_name: delivery.client,
    route: delivery.route,
    status: delivery.status,
    current_location: delivery.currentLocation,
    expected_delivery_date: delivery.expectedDeliveryDate,
    delivered_at: delivery.deliveredAt ?? null,
    proof_notes: delivery.proofNotes || null,
    proof_document_number: delivery.proofDocumentNumber || null,
    proof_file_name: delivery.proofFileName || null,
    proof_received_by: delivery.proofReceivedBy || null,
    proof_registered_at: delivery.proofRegisteredAt ?? null,
    occurrence_notes: delivery.occurrenceNotes || null,
    occurrence_history: delivery.occurrences ?? [],
    owner_name: delivery.owner,
    unit_name: delivery.unit,
    created_at: delivery.createdAt,
  };
}

export function deliveryToLegacyRow(delivery: DeliveryRecord): Record<string, unknown> {
  const row = deliveryToRow(delivery);
  delete row.proof_document_number;
  delete row.proof_file_name;
  delete row.proof_received_by;
  delete row.proof_registered_at;
  delete row.occurrence_history;
  return row;
}

export function rowToDelivery(row: DeliveryRow): DeliveryRecord {
  return {
    id: row.external_id || row.id || crypto.randomUUID(),
    orderId: row.order_external_id ?? undefined,
    orderNumber: row.order_number ?? undefined,
    freightId: row.freight_external_id ?? undefined,
    freightCode: row.freight_code ?? undefined,
    client: row.client_name || "",
    route: row.route || "",
    status: normalizeStatus(row.status),
    currentLocation: row.current_location || "",
    expectedDeliveryDate: row.expected_delivery_date || new Date().toISOString(),
    deliveredAt: row.delivered_at ?? undefined,
    proofNotes: row.proof_notes || "",
    proofDocumentNumber: row.proof_document_number || "",
    proofFileName: row.proof_file_name || "",
    proofReceivedBy: row.proof_received_by || "",
    proofRegisteredAt: row.proof_registered_at ?? undefined,
    occurrenceNotes: row.occurrence_notes || "",
    occurrences: normalizeOccurrences(row.occurrence_history),
    owner: row.owner_name || "",
    unit: row.unit_name || "",
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function normalizeOccurrences(value: unknown): DeliveryOccurrence[] {
  if (!Array.isArray(value)) return [];
  const occurrences: DeliveryOccurrence[] = [];

  value.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    const occurrence: DeliveryOccurrence = {
      id: String(record.id || crypto.randomUUID()),
      type: String(record.type || "Ocorrência"),
      description: String(record.description || ""),
      location: record.location ? String(record.location) : undefined,
      createdAt: String(record.createdAt || new Date().toISOString()),
      createdBy: String(record.createdBy || "Sistema"),
    };

    if (occurrence.description.trim()) {
      occurrences.push(occurrence);
    }
  });

  return occurrences;
}
