import type { FreightRecord } from "@/data/types";
import { getSupabaseClient, getSupabaseConfigStatus } from "@/lib/supabaseClient";

export type DriverEventType =
  | "arrived_loading"
  | "in_transit"
  | "arrived_delivery_location"
  | "unloaded"
  | "proof_uploaded"
  | "completed";
export type FreightTrackingStatus =
  "quoted" | "hired" | "loading" | "in_route" | "delivered" | "cancelled" | DriverEventType;

export interface DriverTrackingEvent {
  id: string;
  freightId: string;
  orderId?: string | null;
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
  linkState: "active" | "expired" | "revoked" | "locked" | "completed" | "invalid";
  expiresAt?: string | null;
  lockedUntil?: string | null;
  failedAttempts?: number;
  nextEvent?: DriverEventType | null;
  events: DriverTrackingEvent[];
  proofs: DeliveryProof[];
  requiresProof: boolean;
}

export interface DriverAccessSummary {
  id: string;
  freightId: string;
  status: "active" | "expired" | "revoked" | "locked" | "completed";
  expiresAt?: string | null;
  revokedAt?: string | null;
  completedAt?: string | null;
  lockedUntil?: string | null;
  failedAttempts: number;
  unlockedAt?: string | null;
  events: DriverTrackingEvent[];
  proofs: DeliveryProof[];
}

export interface GeneratedDriverAccess {
  token: string;
  pin: string;
  url: string;
  expiresAt: string;
}

export const DRIVER_EVENT_FLOW: Array<{
  type: DriverEventType;
  label: string;
  success: string;
}> = [
  {
    type: "arrived_loading",
    label: "Cheguei para carregar",
    success: "Chegada para carregamento registrada.",
  },
  {
    type: "in_transit",
    label: "Estou em trânsito",
    success: "Saída para entrega registrada.",
  },
  {
    type: "arrived_delivery_location",
    label: "Cheguei no destino",
    success: "Chegada no destino registrada.",
  },
  {
    type: "unloaded",
    label: "Descarreguei a mercadoria",
    success: "Descarga registrada.",
  },
  {
    type: "proof_uploaded",
    label: "Enviar comprovante",
    success: "Comprovante enviado com sucesso.",
  },
];

const labels = Object.fromEntries(DRIVER_EVENT_FLOW.map((event) => [event.type, event.label]));

export function getNextDriverEvent(trip: Pick<DriverTrip, "events" | "linkState" | "nextEvent">) {
  if (trip.linkState !== "active") return null;
  if (trip.nextEvent && trip.nextEvent !== "completed") {
    return DRIVER_EVENT_FLOW.find((event) => event.type === trip.nextEvent) ?? null;
  }
  const completed = new Set(trip.events.map((event) => event.eventType));
  return DRIVER_EVENT_FLOW.find((event) => !completed.has(event.type)) ?? null;
}

export function generateDriverToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateDriverPin() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return value.toString().padStart(6, "0");
}

export function getDriverTrackingUrl(token: string) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://master-deal-flow.vercel.app";
  return `${origin}/motorista/${token}`;
}

const mockTrip: DriverTrip = {
  freightId: "f1",
  carrierName: "Transportes Uniao",
  driverName: "Carlos Andrade",
  driverPhone: "(32) 99999-0101",
  vehiclePlate: "ABC-1D23",
  pickupAddress: "CD Master - Cataguases",
  pickupCity: "Cataguases",
  pickupState: "MG",
  deliveryAddress: "Cliente destino",
  deliveryCity: "Juiz de Fora",
  deliveryState: "MG",
  status: "hired",
  linkState: "active",
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  lockedUntil: null,
  failedAttempts: 0,
  nextEvent: "arrived_loading",
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

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toDriverEvent(event: Record<string, unknown>): DriverTrackingEvent {
  const eventType = text(event.event_type) as DriverEventType;
  return {
    id: text(event.id),
    freightId: text(event.freight_id),
    orderId: nullableText(event.order_id),
    eventType,
    eventLabel: nullableText(event.event_label) ?? labels[eventType] ?? eventType,
    occurredAt: text(event.occurred_at),
    latitude: numberOrNull(event.latitude),
    longitude: numberOrNull(event.longitude),
  };
}

function toProof(row: Record<string, unknown>): DeliveryProof {
  return {
    id: text(row.id),
    freightId: text(row.freight_id),
    fileName: text(row.file_name),
    filePath: text(row.file_path),
    mimeType: text(row.mime_type),
    fileSize: toNumber(row.file_size),
    uploadedAt: text(row.uploaded_at),
    signedUrl: nullableText(row.signed_url),
  };
}

function unwrapTrip(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "trip" in payload) {
    return (payload as { trip?: unknown }).trip;
  }
  return payload;
}

function toDriverTrip(payload: unknown): DriverTrip {
  const row = unwrapTrip(payload) as Record<string, unknown>;
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
    lockedUntil: nullableText(row.locked_until),
    failedAttempts: toNumber(row.failed_attempts),
    nextEvent: nullableText(row.next_event) as DriverEventType | null,
    requiresProof: typeof row.requires_proof === "boolean" ? row.requires_proof : true,
    events: ((row.events as Array<Record<string, unknown>> | undefined) ?? []).map(toDriverEvent),
    proofs: ((row.proofs as Array<Record<string, unknown>> | undefined) ?? []).map(toProof),
  };
}

function toAccessSummary(payload: unknown): DriverAccessSummary | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  return {
    id: text(row.id),
    freightId: text(row.freight_id),
    status: text(row.status) as DriverAccessSummary["status"],
    expiresAt: nullableText(row.expires_at),
    revokedAt: nullableText(row.revoked_at),
    completedAt: nullableText(row.completed_at),
    lockedUntil: nullableText(row.locked_until),
    failedAttempts: toNumber(row.failed_attempts),
    unlockedAt: nullableText(row.unlocked_at),
    events: ((row.events as Array<Record<string, unknown>> | undefined) ?? []).map(toDriverEvent),
    proofs: ((row.proofs as Array<Record<string, unknown>> | undefined) ?? []).map(toProof),
  };
}

function getClientOrThrow() {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase nao configurado.");
  return client;
}

async function invokeDriverFunction<T>(
  functionName: string,
  body: Record<string, unknown> | FormData,
) {
  const client = getClientOrThrow();
  const { data, error } = await client.functions.invoke<T>(functionName, { body });
  if (error) throw error;
  return data;
}

async function rpcJson(functionName: string, args: Record<string, unknown>) {
  const client = getClientOrThrow();
  const { data, error } = await client.rpc(functionName, args);
  if (error) {
    const code = "code" in error ? String(error.code) : "";
    const message = error.message ?? "Falha ao executar função do Supabase.";
    const details = "details" in error && error.details ? String(error.details) : "";
    const hint = "hint" in error && error.hint ? String(error.hint) : "";
    const text = `${code} ${message} ${details} ${hint}`.toLowerCase();

    if (
      code === "PGRST202" ||
      text.includes("could not find the function") ||
      (text.includes("function") && text.includes(functionName.toLowerCase()))
    ) {
      throw new Error(
        "Portal do motorista ainda não está aplicado no Supabase. Rode a migration 202607070003_driver_portal.sql e tente gerar o link novamente.",
      );
    }

    if (code === "42501" || text.includes("permission denied")) {
      throw new Error(
        "Permissão insuficiente para o portal do motorista no Supabase. Confira os GRANTs da migration 202607070003_driver_portal.sql.",
      );
    }

    throw error;
  }
  return data;
}

export async function createDriverAccessLink(freight: FreightRecord, expiresAt?: string) {
  const token = generateDriverToken();
  const pin = generateDriverPin();
  const expiration = expiresAt ?? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await rpcJson("create_driver_access_link", {
    p_freight_external_id: freight.id,
    p_order_external_id: freight.orderId ?? null,
    p_token: token,
    p_pin: pin,
    p_expires_at: expiration,
  });

  return {
    token,
    pin,
    url: getDriverTrackingUrl(token),
    expiresAt: expiration,
  } satisfies GeneratedDriverAccess;
}

export async function revokeDriverAccessLink(freight: FreightRecord) {
  await rpcJson("revoke_driver_access_link", { p_freight_external_id: freight.id });
}

export async function fetchDriverAccessSummary(freight: FreightRecord) {
  if (!getSupabaseConfigStatus().configured) return null;
  const payload = await rpcJson("get_driver_access_summary", {
    p_freight_external_id: freight.id,
  });
  return toAccessSummary(payload);
}

export async function getDeliveryProofSignedUrl(path: string) {
  const client = getClientOrThrow();
  const { data, error } = await client.storage
    .from("delivery-proofs")
    .createSignedUrl(path, 60 * 10);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Nao foi possivel abrir o comprovante.");
  return data.signedUrl;
}

export async function authenticateDriverLink(token: string, pin: string) {
  if (!getSupabaseConfigStatus().configured) {
    if (token === "demo" && pin === "123456") return { ok: true as const, trip: mockTrip };
    return { ok: false as const, reason: "invalid_pin" };
  }

  try {
    const payload = await invokeDriverFunction<{ ok: boolean; reason?: string; trip?: unknown }>(
      "driver-link-auth",
      { token, pin },
    );
    if (!payload?.ok) return { ok: false as const, reason: payload?.reason ?? "invalid_pin" };
    return { ok: true as const, trip: toDriverTrip(payload.trip) };
  } catch {
    const payload = (await rpcJson("driver_link_auth", {
      p_token: token,
      p_pin: pin,
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    })) as { ok: boolean; reason?: string; trip?: unknown };
    if (!payload.ok) return { ok: false as const, reason: payload.reason ?? "invalid_pin" };
    return { ok: true as const, trip: toDriverTrip(payload.trip) };
  }
}

export async function fetchDriverTrip(token: string, pin: string) {
  if (!getSupabaseConfigStatus().configured) return token === "demo" ? mockTrip : null;

  try {
    const payload = await invokeDriverFunction<{ ok: boolean; reason?: string; trip?: unknown }>(
      "driver-trip-status",
      { token, pin },
    );
    if (!payload?.ok) return null;
    return toDriverTrip(payload.trip);
  } catch {
    const payload = (await rpcJson("driver_trip_status", {
      p_token: token,
      p_pin: pin,
    })) as { ok: boolean; trip?: unknown };
    return payload.ok ? toDriverTrip(payload.trip) : null;
  }
}

export async function registerDriverEvent(
  token: string,
  pin: string,
  eventType: Exclude<DriverEventType, "proof_uploaded" | "completed">,
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
    mockTrip.nextEvent = getNextDriverEvent(mockTrip)?.type ?? null;
    mockTrip.status = eventType === "unloaded" ? "delivered" : eventType;
    return mockTrip;
  }

  try {
    const payload = await invokeDriverFunction<{ ok: boolean; trip?: unknown }>(
      "driver-trip-event",
      {
        token,
        pin,
        eventType,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
      },
    );
    if (!payload?.ok) throw new Error("Evento recusado.");
    return toDriverTrip(payload.trip);
  } catch {
    const payload = (await rpcJson("driver_trip_event", {
      p_token: token,
      p_pin: pin,
      p_event_type: eventType,
      p_latitude: coords?.latitude ?? null,
      p_longitude: coords?.longitude ?? null,
    })) as { ok: boolean; trip?: unknown };
    if (!payload.ok) throw new Error("Evento recusado.");
    return toDriverTrip(payload.trip);
  }
}

export async function uploadDeliveryProof(
  token: string,
  pin: string,
  file: File,
  coords?: { latitude: number; longitude: number },
) {
  if (!getSupabaseConfigStatus().configured) {
    mockTrip.events.push({
      id: crypto.randomUUID(),
      freightId: mockTrip.freightId,
      eventType: "proof_uploaded",
      eventLabel: labels.proof_uploaded,
      occurredAt: new Date().toISOString(),
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    });
    mockTrip.events.push({
      id: crypto.randomUUID(),
      freightId: mockTrip.freightId,
      eventType: "completed",
      eventLabel: "Entrega concluida",
      occurredAt: new Date().toISOString(),
    });
    mockTrip.status = "delivered";
    mockTrip.linkState = "completed";
    mockTrip.nextEvent = null;
    return mockTrip;
  }

  const formData = new FormData();
  formData.set("token", token);
  formData.set("pin", pin);
  formData.set("file", file);
  if (coords?.latitude != null) formData.set("latitude", String(coords.latitude));
  if (coords?.longitude != null) formData.set("longitude", String(coords.longitude));

  const payload = await invokeDriverFunction<{ ok: boolean; trip?: unknown }>(
    "driver-proof-upload",
    formData,
  );
  if (!payload?.ok) throw new Error("Comprovante recusado.");
  return toDriverTrip(payload.trip);
}
