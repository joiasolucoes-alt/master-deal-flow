import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import type { Order } from "@/data/types";
import {
  orderToRow,
  productToOrderItemRow,
  rowToOrder,
  type OrderRepository,
  type OrderRow,
} from "@/features/orders/repositories/orderRepository";

const ORDER_SELECT = `
  *,
  order_items(*)
`;

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

async function fetchOrderInternal(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from("orders")
    .select(ORDER_SELECT)
    .eq("external_id", id)
    .maybeSingle();

  if (error) throw error;
  return data as OrderRow | null;
}

export function createSupabaseOrderRepository(): OrderRepository {
  return {
    async list() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("orders")
        .select(ORDER_SELECT)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as OrderRow[]).map(rowToOrder);
    },

    async getById(id: string) {
      await ensureSupabaseSession();
      const client = requireClient();
      const data = await fetchOrderInternal(client, id);
      return data ? rowToOrder(data) : null;
    },

    async findBySimulationId(simulationId: string) {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("orders")
        .select(ORDER_SELECT)
        .eq("simulation_external_id", simulationId)
        .maybeSingle();

      if (error) throw error;
      return data ? rowToOrder(data as OrderRow) : null;
    },

    async save(order: Order) {
      await ensureSupabaseSession();
      const client = requireClient();
      if (order.simulationId) {
        const { data: existingData, error: existingError } = await client
          .from("orders")
          .select(ORDER_SELECT)
          .eq("simulation_external_id", order.simulationId)
          .maybeSingle();

        if (existingError) throw existingError;
        const existing = existingData ? rowToOrder(existingData as OrderRow) : null;
        if (existing && existing.id !== order.id) {
          throw new Error(`Simulação já convertida no pedido ${existing.number}.`);
        }
      }

      const { data, error } = await client
        .from("orders")
        .upsert(orderToRow(order), { onConflict: "external_id" })
        .select("id")
        .single();

      if (error) throw error;
      const orderUuid = data.id as string;
      const deleteResult = await client.from("order_items").delete().eq("order_id", orderUuid);
      if (deleteResult.error) throw deleteResult.error;
      if (order.products.length > 0) {
        const insertResult = await client
          .from("order_items")
          .insert(order.products.map((product) => productToOrderItemRow(product, orderUuid)));
        if (insertResult.error) throw insertResult.error;
      }

      await insertAuditEvent(client, orderUuid, order.id, "saved", {
        number: order.number,
        status: order.status,
      });
      const saved = await fetchOrderInternal(client, order.id);
      return saved ? rowToOrder(saved) : order;
    },
  };
}

async function insertAuditEvent(
  client: SupabaseClient,
  entityId: string,
  entityExternalId: string,
  action: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await client.from("audit_events").insert({
    entity_type: "order",
    entity_id: entityId,
    entity_external_id: entityExternalId,
    action,
    description: `Evento ${action} registrado para pedido.`,
    metadata,
  });

  if (error) throw error;
}
