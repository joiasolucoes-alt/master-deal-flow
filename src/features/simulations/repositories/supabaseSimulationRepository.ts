import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import type { Simulation } from "@/data/types";
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
      const { data, error } = await client
        .from("simulations")
        .upsert(row, { onConflict: "external_id" })
        .select("id")
        .single();

      if (error) throw error;
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
        simulation.products.map((product) => productToSimulationItemRow(product, simulationUuid)),
      );
      await replaceChildren(
        client,
        "simulation_costs",
        simulationUuid,
        simulation.expenseItems.map((expense) =>
          expenseToSimulationCostRow(expense, simulationUuid),
        ),
      );
      await replaceChildren(
        client,
        "simulation_purchase_costs",
        simulationUuid,
        simulation.purchaseItems.map((purchase) =>
          purchaseToSimulationPurchaseCostRow(purchase, simulationUuid),
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
      });
      await insertNotification(client, simulation.id, simulation.status, simulation.number);

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
  const insertResult = await client.from(table).insert(rows);
  if (insertResult.error) throw insertResult.error;
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
    "Aprovada",
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
