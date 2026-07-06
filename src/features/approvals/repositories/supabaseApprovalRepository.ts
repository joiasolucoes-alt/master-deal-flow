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

function isMissingSchemaColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message) : "";
  const code = "code" in error ? String(error.code) : "";
  return (
    code === "PGRST204" &&
    (message.includes("stage") ||
      message.includes("bank_account") ||
      message.includes("decided_at"))
  );
}

export function createSupabaseApprovalRepository(): ApprovalRepository {
  return {
    async listPending() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("approvals")
        .select("*, simulations(external_id)")
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

      const { data: authData } = await client.auth.getUser();
      const { data: approverProfile } = authData.user
        ? await client
            .from("profiles")
            .select("id")
            .eq("auth_user_id", authData.user.id)
            .maybeSingle()
        : { data: null };

      const row: Record<string, unknown> = {
        ...approvalToRow(record),
        simulation_id: simulation.id,
        approver_id: approverProfile?.id ?? null,
        updated_at: new Date().toISOString(),
      };

      let { data, error } = await client
        .from("approvals")
        .upsert(row, { onConflict: "external_id" })
        .select("*")
        .single();

      if (error && isMissingSchemaColumnError(error)) {
        const compatibleRow = { ...row };
        delete compatibleRow.stage;
        delete compatibleRow.bank_account;
        delete compatibleRow.decided_at;
        const retry = await client
          .from("approvals")
          .upsert(compatibleRow, { onConflict: "external_id" })
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;
      await insertAuditEvent(client, record).catch((auditError) => {
        console.warn("Aprovação salva, mas auditoria não foi registrada.", auditError);
      });
      await insertNotification(client, record).catch((notificationError) => {
        console.warn("Aprovação salva, mas notificação não foi registrada.", notificationError);
      });
      return rowToApproval(data as ApprovalRow);
    },
  };
}

async function insertNotification(client: SupabaseClient, record: ApprovalRecord) {
  const statusLabel = {
    pending: "enviada para aprovação",
    approved: "aprovada",
    adjustment_requested: "devolvida para ajuste",
    rejected: "reprovada",
  }[record.status];

  const { error } = await client.from("notifications").insert({
    title: "Atualização de aprovação",
    message: `Simulação ${record.simulationId} ${statusLabel}.`,
    type: record.status === "approved" ? "success" : "info",
    entity_type: "simulation",
    entity_external_id: record.simulationId,
  });

  if (error) throw error;
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
