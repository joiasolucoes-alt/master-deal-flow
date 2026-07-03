import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import {
  freightToRow,
  rowToFreight,
  type FreightRepository,
  type FreightRow,
} from "@/features/freights/repositories/freightRepository";

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

export function createSupabaseFreightRepository(): FreightRepository {
  return {
    async list() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("freights")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as FreightRow[]).map(rowToFreight);
    },

    async save(freight) {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("freights")
        .upsert(freightToRow(freight), { onConflict: "external_id" })
        .select("*")
        .single();

      if (error) throw error;
      return rowToFreight(data as FreightRow);
    },
  };
}
