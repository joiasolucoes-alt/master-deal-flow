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

function getMissingSchemaColumn(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error ? String(error.message) : "";
  const code = "code" in error ? String(error.code) : "";
  if (code !== "PGRST204") return null;
  return message.match(/'([^']+)'/)?.[1] ?? null;
}

function isMissingOnConflictConstraint(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message) : "";
  const code = "code" in error ? String(error.code) : "";
  return (
    code === "42P10" ||
    message.includes("there is no unique or exclusion constraint matching the ON CONFLICT")
  );
}

async function saveRealizedResultWithoutOnConflict(
  client: SupabaseClient,
  row: Record<string, unknown>,
) {
  const compatibleRow = { ...row };
  const externalId = typeof row.external_id === "string" ? row.external_id : null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    let existingId: string | null = null;

    if (externalId) {
      const existing = await client
        .from("realized_results")
        .select("id")
        .eq("external_id", externalId)
        .maybeSingle();

      if (existing.error) return existing;
      existingId = existing.data?.id ?? null;
    }

    const result = existingId
      ? await client
          .from("realized_results")
          .update(compatibleRow)
          .eq("id", existingId)
          .select("*")
          .single()
      : await client.from("realized_results").insert(compatibleRow).select("*").single();

    const missingColumn = getMissingSchemaColumn(result.error);
    if (!result.error || !missingColumn || !(missingColumn in compatibleRow)) return result;
    delete compatibleRow[missingColumn];
  }

  return client.from("realized_results").insert(compatibleRow).select("*").single();
}

async function upsertRealizedResultWithSchemaFallback(
  client: SupabaseClient,
  row: Record<string, unknown>,
) {
  const compatibleRow = { ...row };

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await client
      .from("realized_results")
      .upsert(compatibleRow, { onConflict: "external_id" })
      .select("*")
      .single();

    const missingColumn = getMissingSchemaColumn(result.error);
    if (missingColumn && missingColumn in compatibleRow) {
      delete compatibleRow[missingColumn];
      continue;
    }

    if (isMissingOnConflictConstraint(result.error)) {
      return saveRealizedResultWithoutOnConflict(client, compatibleRow);
    }

    return result;
  }

  return client
    .from("realized_results")
    .upsert(compatibleRow, { onConflict: "external_id" })
    .select("*")
    .single();
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
      const payload = realizedResultToRow(result);
      const { data, error } = await upsertRealizedResultWithSchemaFallback(client, payload);

      if (error) {
        if (
          result.commissionApprovalStatus === "pending" &&
          isMissingCommissionColumnError(error)
        ) {
          const { data: legacyData, error: legacyError } = await client
            .from("realized_results")
            .upsert(stripCommissionApprovalColumns(payload), { onConflict: "external_id" })
            .select("*")
            .single();

          if (legacyError) throw legacyError;
          return rowToRealizedResult(legacyData as RealizedResultRow);
        }

        throw error;
      }

      return rowToRealizedResult(data as RealizedResultRow);
    },
  };
}

function stripCommissionApprovalColumns(payload: Record<string, unknown>) {
  const {
    commission_approval_status: _commissionApprovalStatus,
    commission_approved_by: _commissionApprovedBy,
    commission_approved_at: _commissionApprovedAt,
    commission_notes: _commissionNotes,
    ...legacyPayload
  } = payload;

  return legacyPayload;
}

function isMissingCommissionColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  return [
    "commission_approval_status",
    "commission_approved_by",
    "commission_approved_at",
    "commission_notes",
  ].some((column) => message.includes(column));
}
