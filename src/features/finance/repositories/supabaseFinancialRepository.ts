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

function getMissingSchemaColumn(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error ? String(error.message) : "";
  const code = "code" in error ? String(error.code) : "";
  if (code !== "PGRST204") return null;
  return message.match(/'([^']+)'/)?.[1] ?? null;
}

async function upsertFinancialTitleWithSchemaFallback(
  client: SupabaseClient,
  row: Record<string, unknown>,
) {
  const compatibleRow = { ...row };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await client
      .from("financial_titles")
      .upsert(compatibleRow, { onConflict: "external_id" })
      .select("*")
      .single();

    const missingColumn = getMissingSchemaColumn(result.error);
    if (!result.error || !missingColumn || !(missingColumn in compatibleRow)) return result;
    delete compatibleRow[missingColumn];
  }

  return client
    .from("financial_titles")
    .upsert(compatibleRow, { onConflict: "external_id" })
    .select("*")
    .single();
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
      const { data, error } = await upsertFinancialTitleWithSchemaFallback(
        client,
        financialTitleToRow(title),
      );

      if (error) throw error;
      return rowToFinancialTitle(data as FinancialTitleRow);
    },
  };
}
