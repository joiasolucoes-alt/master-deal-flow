import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import type { Negotiation } from "@/data/types";
import {
  rowToNegotiation,
  type NegotiationRepository,
  type NegotiationRow,
} from "@/features/negotiations/repositories/negotiationRepository";

const NEGOTIATION_SELECT = `
  *,
  clients(name),
  profiles(full_name,name,email)
`;

type ForeignKeys = {
  clientId?: string | null;
  responsibleId?: string | null;
  unitId?: string | null;
  organizationId?: string | null;
};

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

async function resolveForeignKeys(
  client: SupabaseClient,
  negotiation: Negotiation,
): Promise<ForeignKeys> {
  const [{ data: clients }, { data: profiles }, { data: units }] = await Promise.all([
    client.from("clients").select("id").eq("name", negotiation.client).limit(1),
    client
      .from("profiles")
      .select("id")
      .or(`full_name.eq.${negotiation.owner},name.eq.${negotiation.owner}`)
      .limit(1),
    client.from("units").select("id, organization_id").limit(1),
  ]);

  const unit = units?.[0] as { id?: string | null; organization_id?: string | null } | undefined;

  return {
    clientId: clients?.[0]?.id ?? null,
    responsibleId: profiles?.[0]?.id ?? null,
    unitId: unit?.id ?? null,
    organizationId: unit?.organization_id ?? null,
  };
}

function negotiationToRow(negotiation: Negotiation, keys: ForeignKeys): Record<string, unknown> {
  return {
    external_id: negotiation.id,
    number: negotiation.number,
    client_id: keys.clientId ?? null,
    responsible_id: keys.responsibleId ?? null,
    unit_id: keys.unitId ?? null,
    organization_id: keys.organizationId ?? null,
    current_stage: negotiation.stage,
    status: negotiation.status,
    total_value: negotiation.expectedValue,
    expected_value: negotiation.expectedValue,
    expected_margin: negotiation.marginPercent,
    next_action: negotiation.nextAction,
  };
}

export function createSupabaseNegotiationRepository(): NegotiationRepository {
  return {
    async list() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("negotiations")
        .select(NEGOTIATION_SELECT)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as NegotiationRow[]).map(rowToNegotiation);
    },

    async save(negotiation) {
      await ensureSupabaseSession();
      const client = requireClient();
      const keys = await resolveForeignKeys(client, negotiation);
      const { data, error } = await client
        .from("negotiations")
        .upsert(negotiationToRow(negotiation, keys), { onConflict: "external_id" })
        .select(NEGOTIATION_SELECT)
        .single();

      if (error) throw error;
      return rowToNegotiation(data as NegotiationRow);
    },
  };
}
