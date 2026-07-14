import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import type { Negotiation } from "@/data/types";
import {
  negotiationToRow,
  rowToNegotiation,
  type NegotiationRepository,
  type NegotiationRow,
} from "@/features/negotiations/repositories/negotiationRepository";

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

export function createSupabaseNegotiationRepository(): NegotiationRepository {
  return {
    async list() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("negotiations")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as NegotiationRow[]).map(rowToNegotiation);
    },

    async save(negotiation: Negotiation) {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("negotiations")
        .upsert(negotiationToRow(negotiation), { onConflict: "external_id" })
        .select("*")
        .single();

      if (error) throw error;
      return rowToNegotiation(data as NegotiationRow);
    },
  };
}
