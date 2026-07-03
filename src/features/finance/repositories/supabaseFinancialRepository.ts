import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import type {
  FinancialRepository,
  FinancialTitleRow,
} from "@/features/finance/repositories/financialRepository";
import {
  financialTitleToRow,
  rowToFinancialTitle,
} from "@/features/finance/repositories/financialRepository";

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

export function createSupabaseFinancialRepository(): FinancialRepository {
  return {
    async listTitles() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("financial_titles")
        .select("*")
        .order("due_date", { ascending: true });

      if (error) throw error;
      return ((data ?? []) as FinancialTitleRow[]).map(rowToFinancialTitle);
    },

    async saveTitle(title) {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("financial_titles")
        .upsert(financialTitleToRow(title), { onConflict: "external_id" })
        .select("*")
        .single();

      if (error) throw error;
      return rowToFinancialTitle(data as FinancialTitleRow);
    },
  };
}
