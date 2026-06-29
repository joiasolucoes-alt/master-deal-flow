import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import {
  approvalToRow,
  rowToApproval,
  type ApprovalRecord,
  type ApprovalRepository,
  type ApprovalRow,
} from "@/features/approvals/repositories/approvalRepository";

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

export function createSupabaseApprovalRepository(): ApprovalRepository {
  return {
    async listPending() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("approvals")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as ApprovalRow[]).map(rowToApproval);
    },

    async save(record: ApprovalRecord) {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data: simulation, error: simulationError } = await client
        .from("simulations")
        .select("id")
        .eq("external_id", record.simulationId)
        .maybeSingle();

      if (simulationError) throw simulationError;
      if (!simulation?.id) {
        throw new Error("Simulação não encontrada para registrar aprovação.");
      }

      const { data, error } = await client
        .from("approvals")
        .upsert(
          {
            ...approvalToRow(record),
            simulation_id: simulation.id,
          },
          { onConflict: "external_id" },
        )
        .select("*")
        .single();

      if (error) throw error;
      await insertAuditEvent(client, record);
      return rowToApproval(data as ApprovalRow);
    },
  };
}

async function insertAuditEvent(client: SupabaseClient, record: ApprovalRecord) {
  const { error } = await client.from("audit_events").insert({
    entity_type: "simulation",
    entity_external_id: record.simulationId,
    action: record.status,
    description: "Decisão de aprovação registrada.",
    metadata: {
      approvalId: record.id,
      comment: record.comment ?? null,
    },
  });

  if (error) throw error;
}
