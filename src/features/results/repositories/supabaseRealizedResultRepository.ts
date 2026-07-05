import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import type {
  RealizedResultRepository,
  RealizedResultRow,
} from "@/features/results/repositories/realizedResultRepository";
import {
  realizedResultToRow,
  rowToRealizedResult,
} from "@/features/results/repositories/realizedResultRepository";

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

export function createSupabaseRealizedResultRepository(): RealizedResultRepository {
  return {
    async list() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("realized_results")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as RealizedResultRow[]).map(rowToRealizedResult);
    },

    async save(result) {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("realized_results")
        .upsert(realizedResultToRow(result), { onConflict: "external_id" })
        .select("*")
        .single();

      if (error) throw error;
      return rowToRealizedResult(data as RealizedResultRow);
    },
  };
}
