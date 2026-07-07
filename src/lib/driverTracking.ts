import { getSupabaseClient, getSupabaseConfigStatus } from "@/lib/supabaseClient";

export type DriverEventType =
  "arrived_pickup" | "loaded" | "in_transit" | "delivered" | "proof_uploaded";
export type FreightTrackingStatus =
  | "quoted"
  | "hired"
  | "loading"
  | "in_route"
  | "contracted"
  | DriverEventType
  | "completed"
  | "cancelled";

export interface DriverTrackingEvent {
  id: string;
  freightId: string;
  eventType: DriverEventType;
  eventLabel: string;
  occurredAt: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DeliveryProof {
  id: string;
  freightId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
  signedUrl?: string | null;
}

export interface DriverTrip {
  freightId: string;
  carrierName?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehiclePlate?: string | null;
  pickupAddress: string;
  pickupCity: string;
  pickupState: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  status: FreightTrackingStatus;
  linkState: "active" | "expired" | "revoked" | "completed";
  expiresAt?: string | null;
  events: DriverTrackingEvent[];
  proofs: DeliveryProof[];
  requiresProof: boolean;
}

export const DRIVER_EVENT_FLOW: Array<{ type: DriverEventType; label: string; success: string }> = [
  {
    type: "arrived_pickup",
    label: "Cheguei para coletar",
    success: "Chegada para coleta registrada com sucesso.",
  },
  { type: "loaded", label: "Caminhão carregado", success: "Carregamento registrado com sucesso." },
  {
    type: "in_transit",
    label: "Saiu para entrega / Em trânsito",
    success: "Saída para entrega registrada com sucesso.",
  },
  { type: "delivered", label: "Mercadoria entregue", success: "Entrega registrada com sucesso." },
  {
    type: "proof_uploaded",
    label: "Anexar comprovante assinado",
    success: "Comprovante anexado com sucesso.",
  },
];

const labels = Object.fromEntries(DRIVER_EVENT_FLOW.map((event) => [event.type, event.label]));

export function getNextDriverEvent(
  trip: Pick<DriverTrip, "events" | "status" | "linkState" | "requiresProof">,
) {
  if (trip.linkState !== "active" || trip.status === "completed" || trip.status === "cancelled")
    return null;
  const completed = new Set(trip.events.map((event) => event.eventType));
  for (const event of DRIVER_EVENT_FLOW) {
    if (event.type === "proof_uploaded" && !trip.requiresProof) continue;
    if (!completed.has(event.type)) return event;
  }
  return null;
}

export function validateDriverEventOrder(events: DriverTrackingEvent[], nextType: DriverEventType) {
  const expected = getNextDriverEvent({
    events,
    status: "contracted",
    linkState: "active",
    requiresProof: true,
  });
  return expected?.type === nextType;
}

export function generateDriverToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getDriverTrackingUrl(token: string) {
  return `${window.location.origin}/motorista/${token}`;
}

const mockTrip: DriverTrip = {
  freightId: "f1",
  carrierName: "Transportes União",
  driverName: "Carlos Andrade",
  driverPhone: "(32) 99999-0101",
  vehiclePlate: "ABC-1D23",
  pickupAddress: "CD Master — Cataguases",
  pickupCity: "Cataguases",
  pickupState: "MG",
  deliveryAddress: "Cliente destino",
  deliveryCity: "Juiz de Fora",
  deliveryState: "MG",
  status: "contracted",
  linkState: "active",
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  events: [],
  proofs: [],
  requiresProof: true,
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}

function toDriverTrip(row: Record<string, unknown>): DriverTrip {
  return {
    freightId: text(row.freight_id),
    carrierName: nullableText(row.carrier_name),
    driverName: nullableText(row.driver_name),
    driverPhone: nullableText(row.driver_phone),
    vehiclePlate: nullableText(row.vehicle_plate),
    pickupAddress: text(row.pickup_address),
    pickupCity: text(row.pickup_city),
    pickupState: text(row.pickup_state),
    deliveryAddress: text(row.delivery_address),
    deliveryCity: text(row.delivery_city),
    deliveryState: text(row.delivery_state),
    status: text(row.status) as FreightTrackingStatus,
    linkState: text(row.link_state) as DriverTrip["linkState"],
    expiresAt: nullableText(row.expires_at),
    requiresProof: typeof row.requires_proof === "boolean" ? row.requires_proof : true,
    events: ((row.events as Array<Record<string, unknown>> | undefined) ?? []).map((event) => ({
      id: text(event.id),
      freightId: text(event.freight_id),
      eventType: text(event.event_type) as DriverEventType,
      eventLabel:
        nullableText(event.event_label) ?? labels[text(event.event_type) as DriverEventType],
      occurredAt: text(event.occurred_at),
      latitude: numberOrNull(event.latitude),
      longitude: numberOrNull(event.longitude),
    })),
    proofs: (row.proofs as DeliveryProof[] | undefined) ?? [],
  };
}

export async function fetchDriverTrip(token: string) {
  if (!getSupabaseConfigStatus().configured) return token === "demo" ? mockTrip : null;
  const client = getSupabaseClient();
  if (!client) return token === "demo" ? mockTrip : null;
  const { data, error } = await client.rpc("get_driver_trip", { p_token: token });
  if (error) throw error;
  return data ? toDriverTrip(data) : null;
}

export async function registerDriverEvent(
  token: string,
  eventType: DriverEventType,
  coords?: { latitude: number; longitude: number },
) {
  if (!getSupabaseConfigStatus().configured) {
    mockTrip.events.push({
      id: crypto.randomUUID(),
      freightId: mockTrip.freightId,
      eventType,
      eventLabel: labels[eventType],
      occurredAt: new Date().toISOString(),
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    });
    mockTrip.status = eventType === "proof_uploaded" ? "completed" : eventType;
    return mockTrip;
  }
  const client = getSupabaseClient();
  if (!client) return mockTrip;
  const { data, error } = await client.rpc("register_driver_event", {
    p_token: token,
    p_event_type: eventType,
    p_latitude: coords?.latitude ?? null,
    p_longitude: coords?.longitude ?? null,
  });
  if (error) throw error;
  return toDriverTrip(data);
}

export async function uploadDeliveryProof(
  token: string,
  file: File,
  coords?: { latitude: number; longitude: number },
) {
  if (!getSupabaseConfigStatus().configured)
    return registerDriverEvent(token, "proof_uploaded", coords);
  const filePayload = {
    name: file.name,
    mime_type: file.type,
    size: file.size,
    content_base64: await fileToBase64(file),
  };
  const client = getSupabaseClient();
  if (!client) return mockTrip;
  const { data, error } = await client.rpc("upload_delivery_proof", {
    p_token: token,
    p_file: filePayload,
    p_latitude: coords?.latitude ?? null,
    p_longitude: coords?.longitude ?? null,
  });
  if (error) throw error;
  return toDriverTrip(data);
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
