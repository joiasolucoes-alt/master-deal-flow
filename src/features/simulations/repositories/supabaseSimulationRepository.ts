import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import type { Simulation, User } from "@/data/types";
import {
  expenseToSimulationCostRow,
  installmentToRow,
  productToSimulationItemRow,
  purchaseToSimulationPurchaseCostRow,
  rowToSimulation,
  simulationToRow,
  type SimulationRepository,
  type SimulationRow,
} from "@/features/simulations/repositories/simulationRepository";
import { getSimulationTotals } from "@/lib/calculations";
import { normalizeRole } from "@/lib/permissions";
import { isSimulationAdjustmentRequested } from "@/lib/simulationStatus";
import { matchesUserIdentity } from "@/lib/userIdentity";

const SIMULATION_SELECT = `
  *,
  simulation_items(*),
  simulation_costs(*),
  simulation_purchase_costs(*),
  simulation_installments(*),
  approvals(*)
`;

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

function isMissingSchemaColumnError(error: unknown, column: string) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message) : "";
  const code = "code" in error ? String(error.code) : "";
  return code === "PGRST204" && message.includes(column);
}

function getMissingSchemaColumn(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error ? String(error.message) : "";
  const code = "code" in error ? String(error.code) : "";
  if (code !== "PGRST204") return null;
  return message.match(/'([^']+)'/)?.[1] ?? null;
}

async function upsertSimulationRowWithSchemaFallback(
  client: SupabaseClient,
  row: Record<string, unknown>,
) {
  const compatibleRow = { ...row };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await client
      .from("simulations")
      .upsert(compatibleRow, { onConflict: "external_id" })
      .select("id")
      .single();

    const missingColumn = getMissingSchemaColumn(result.error);
    if (!result.error || !missingColumn || !(missingColumn in compatibleRow)) return result;

    delete compatibleRow[missingColumn];
  }

  return client
    .from("simulations")
    .upsert(compatibleRow, { onConflict: "external_id" })
    .select("id")
    .single();
}

async function fetchSimulationInternal(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from("simulations")
    .select(SIMULATION_SELECT)
    .eq("external_id", id)
    .maybeSingle();

  if (error) throw error;
  return data as SimulationRow | null;
}

export function createSupabaseSimulationRepository(): SimulationRepository {
  return {
    async list() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("simulations")
        .select(SIMULATION_SELECT)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as SimulationRow[]).map(rowToSimulation);
    },

    async listAdjustments(user?: User | null) {
      await ensureSupabaseSession();
      const client = requireClient();
      let { data, error } = await client
        .from("simulations")
        .select(SIMULATION_SELECT)
        .eq("status", "Ajuste solicitado")
        .order("adjustment_requested_at", { ascending: false, nullsFirst: false });

      if (error && isMissingSchemaColumnError(error, "adjustment_requested_at")) {
        const retry = await client
          .from("simulations")
          .select(SIMULATION_SELECT)
          .eq("status", "Ajuste solicitado")
          .order("created_at", { ascending: false });
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        const retry = await client
          .from("simulations")
          .select(SIMULATION_SELECT)
          .order("created_at", { ascending: false });
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      const simulations = ((data ?? []) as SimulationRow[])
        .map(rowToSimulation)
        .filter(isSimulationAdjustmentRequested);
      if (!user || normalizeRole(user.role) === "Admin") return simulations;
      return simulations.filter((simulation) => matchesUserIdentity(simulation.owner, user));
    },

    async getById(id: string) {
      await ensureSupabaseSession();
      const client = requireClient();
      const data = await fetchSimulationInternal(client, id);
      return data ? rowToSimulation(data) : null;
    },

    async save(simulation: Simulation) {
      await ensureSupabaseSession();
      const client = requireClient();
      const row = simulationToRow(simulation);
      const { data, error } = await upsertSimulationRowWithSchemaFallback(client, row);

      if (error) throw error;
      if (!data?.id) throw new Error("Simulação não retornou identificador no Supabase.");
      const simulationUuid = data.id as string;
      const totals = getSimulationTotals(simulation);
      const installmentAmount =
        simulation.financial.installmentDays.length > 0
          ? totals.revenue / simulation.financial.installmentDays.length
          : 0;

      await replaceChildren(
        client,
        "simulation_items",
        simulationUuid,
        withUniqueExternalIds(
          simulation.products.map((product) => productToSimulationItemRow(product, simulationUuid)),
        ),
      );
      await replaceChildren(
        client,
        "simulation_costs",
        simulationUuid,
        withUniqueExternalIds(
          simulation.expenseItems.map((expense) =>
            expenseToSimulationCostRow(expense, simulationUuid),
          ),
        ),
      );
      await replaceChildren(
        client,
        "simulation_purchase_costs",
        simulationUuid,
        withUniqueExternalIds(
          simulation.purchaseItems.map((purchase) =>
            purchaseToSimulationPurchaseCostRow(purchase, simulationUuid),
          ),
        ),
      );
      await replaceChildren(
        client,
        "simulation_installments",
        simulationUuid,
        simulation.financial.installmentDays.map((day, index) =>
          installmentToRow(
            day,
            index,
            simulationUuid,
            installmentAmount,
            simulation.financial.bank,
          ),
        ),
      );

      await insertAuditEvent(client, "simulation", simulationUuid, simulation.id, "saved", {
        number: simulation.number,
        status: simulation.status,
      }).catch((auditError) => {
        console.warn("Simulação salva, mas auditoria não foi registrada.", auditError);
      });
      await insertNotification(client, simulation.id, simulation.status, simulation.number).catch(
        (notificationError) => {
          console.warn("Simulação salva, mas notificação não foi registrada.", notificationError);
        },
      );

      const saved = await fetchSimulationInternal(client, simulation.id);
      return saved ? rowToSimulation(saved) : simulation;
    },
  };
}

async function replaceChildren(
  client: SupabaseClient,
  table: string,
  simulationUuid: string,
  rows: Record<string, unknown>[],
) {
  const deleteResult = await client.from(table).delete().eq("simulation_id", simulationUuid);
  if (deleteResult.error) throw deleteResult.error;
  if (rows.length === 0) return;

  const conflictTarget =
    table === "simulation_installments"
      ? "simulation_id,installment_number"
      : "simulation_id,external_id";
  const upsertResult = await client.from(table).upsert(rows, { onConflict: conflictTarget });
  if (upsertResult.error) throw upsertResult.error;
}

function withUniqueExternalIds(rows: Record<string, unknown>[]) {
  const occurrences = new Map<string, number>();

  return rows.map((row, index) => {
    const rawExternalId =
      typeof row.external_id === "string" && row.external_id.trim().length > 0
        ? row.external_id
        : `row-${index + 1}`;
    const previousOccurrences = occurrences.get(rawExternalId) ?? 0;
    occurrences.set(rawExternalId, previousOccurrences + 1);

    if (previousOccurrences === 0) return row;

    return {
      ...row,
      external_id: `${rawExternalId}-${previousOccurrences + 1}`,
    };
  });
}

async function insertAuditEvent(
  client: SupabaseClient,
  entityType: string,
  entityId: string,
  entityExternalId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await client.from("audit_events").insert({
    entity_type: entityType,
    entity_id: entityId,
    entity_external_id: entityExternalId,
    action,
    description: `Evento ${action} registrado para ${entityType}.`,
    metadata,
  });

  if (error) throw error;
}

async function insertNotification(
  client: SupabaseClient,
  simulationExternalId: string,
  status: Simulation["status"],
  number: string,
) {
  const importantStatuses = new Set<Simulation["status"]>([
    "Pendente de aprovação",
    "Aguardando aprovação do Gestor",
    "Aguardando pagamento",
    "Pagamento realizado",
    "Comprovante anexado",
    "Aguardando validação comercial",
    "Pedido confirmado",
    "Ajuste solicitado",
    "Reprovada",
  ]);

  if (!importantStatuses.has(status)) return;

  const { error } = await client.from("notifications").insert({
    title: `Simulação ${number}`,
    message: `Status atualizado para ${status}.`,
    type: "info",
    entity_type: "simulation",
    entity_external_id: simulationExternalId,
  });

  if (error) throw error;
}
