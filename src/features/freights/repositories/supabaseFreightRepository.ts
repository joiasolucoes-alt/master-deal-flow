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

function isMissingPlannedFreightValueColumn(error: { code?: string; message?: string }) {
  const details = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    details.includes("planned_freight_value") &&
    (details.includes("column") || error.code === "PGRST204" || error.code === "42703")
  );
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
      const row = freightToRow(freight);
      let { data, error } = await client
        .from("freights")
        .upsert(row, { onConflict: "external_id" })
        .select("*")
        .single();

      if (error && isMissingPlannedFreightValueColumn(error)) {
        const compatibleRow = { ...row };
        delete compatibleRow.planned_freight_value;
        const retry = await client
          .from("freights")
          .upsert(compatibleRow, { onConflict: "external_id" })
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      return rowToFreight(data as FreightRow);
    },
  };
}
