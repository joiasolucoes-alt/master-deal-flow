import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const allowedEvents = new Set([
  "arrived_loading",
  "in_transit",
  "arrived_delivery_location",
  "unloaded",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, reason: "method_not_allowed" }, 405);

  try {
    const { token, pin, eventType, latitude, longitude } = await req.json();
    if (!token || !pin) return jsonResponse({ ok: false, reason: "missing_credentials" }, 400);
    if (!allowedEvents.has(String(eventType))) {
      return jsonResponse({ ok: false, reason: "invalid_event" }, 400);
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("driver_trip_event", {
      p_token: String(token),
      p_pin: String(pin),
      p_event_type: String(eventType),
      p_latitude: latitude ?? null,
      p_longitude: longitude ?? null,
    });

    if (error) return jsonResponse({ ok: false, reason: error.message }, 400);
    return jsonResponse(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    return jsonResponse({ ok: false, reason: message }, 500);
  }
});
