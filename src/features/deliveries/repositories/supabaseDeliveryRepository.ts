import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import {
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
      const { data, error } = await client
        .from("deliveries")
        .upsert(deliveryToRow(delivery), { onConflict: "external_id" })
        .select("*")
        .single();

      if (error) throw error;
      return rowToDelivery(data as DeliveryRow);
    },
  };
}
