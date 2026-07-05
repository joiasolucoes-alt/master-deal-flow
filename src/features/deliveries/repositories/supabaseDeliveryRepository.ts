import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import {
  deliveryToLegacyRow,
  deliveryToRow,
  rowToDelivery,
  type DeliveryRepository,
  type DeliveryRow,
} from "@/features/deliveries/repositories/deliveryRepository";

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

export function createSupabaseDeliveryRepository(): DeliveryRepository {
  return {
    async list() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("deliveries")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as DeliveryRow[]).map(rowToDelivery);
    },

    async save(delivery) {
      await ensureSupabaseSession();
      const client = requireClient();
      let { data, error } = await client
        .from("deliveries")
        .upsert(deliveryToRow(delivery), { onConflict: "external_id" })
        .select("*")
        .single();

      if (isMissingDeliveryColumnError(error)) {
        const legacyResult = await client
          .from("deliveries")
          .upsert(deliveryToLegacyRow(delivery), { onConflict: "external_id" })
          .select("*")
          .single();
        data = legacyResult.data;
        error = legacyResult.error;
      }

      if (error) throw error;
      return rowToDelivery(data as DeliveryRow);
    },
  };
}

function isMissingDeliveryColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "42703" && (message.includes("proof_") || message.includes("occurrence_"));
}
