import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, reason: "method_not_allowed" }, 405);

  try {
    const { token, pin } = await req.json();
    if (!token || !pin) return jsonResponse({ ok: false, reason: "missing_credentials" }, 400);

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("driver_trip_status", {
      p_token: String(token),
      p_pin: String(pin),
    });

    if (error) return jsonResponse({ ok: false, reason: error.message }, 400);
    return jsonResponse(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    return jsonResponse({ ok: false, reason: message }, 500);
  }
});
