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
      const payload = realizedResultToRow(result);
      const { data, error } = await client
        .from("realized_results")
        .upsert(payload, { onConflict: "external_id" })
        .select("*")
        .single();

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
