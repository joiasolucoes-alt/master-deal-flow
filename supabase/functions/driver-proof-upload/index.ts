import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

const maxFileSize = 10 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "comprovante";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, reason: "method_not_allowed" }, 405);

  try {
    const form = await req.formData();
    const token = String(form.get("token") ?? "");
    const pin = String(form.get("pin") ?? "");
    const latitude = form.get("latitude");
    const longitude = form.get("longitude");
    const file = form.get("file");

    if (!token || !pin) return jsonResponse({ ok: false, reason: "missing_credentials" }, 400);
    if (!(file instanceof File)) return jsonResponse({ ok: false, reason: "missing_file" }, 400);
    if (!allowedMimeTypes.has(file.type)) {
      return jsonResponse({ ok: false, reason: "invalid_file_type" }, 400);
    }
    if (file.size > maxFileSize) return jsonResponse({ ok: false, reason: "file_too_large" }, 400);

    const supabase = createServiceClient();
    const filePath = `driver/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error: uploadError } = await supabase.storage
      .from("delivery-proofs")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) return jsonResponse({ ok: false, reason: uploadError.message }, 400);

    const { data, error } = await supabase.rpc("driver_proof_record", {
      p_token: token,
      p_pin: pin,
      p_file_path: filePath,
      p_file_name: file.name,
      p_mime_type: file.type,
      p_file_size: file.size,
      p_latitude: latitude ? Number(latitude) : null,
      p_longitude: longitude ? Number(longitude) : null,
    });

    if (error) return jsonResponse({ ok: false, reason: error.message }, 400);
    return jsonResponse(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected_error";
    return jsonResponse({ ok: false, reason: message }, 500);
  }
});
