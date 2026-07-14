import type { Negotiation } from "@/data/types";

export interface NegotiationRepository {
  list(): Promise<Negotiation[]>;
  save(negotiation: Negotiation): Promise<Negotiation>;
}

export type NegotiationRow = {
  id?: string;
  external_id?: string | null;
  number: string;
  client_name?: string | null;
  responsible_name?: string | null;
  current_stage?: string | null;
  status?: string | null;
  total_value?: number | null;
  expected_margin?: number | null;
  next_action?: string | null;
};

function toNumber(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function rowToNegotiation(row: NegotiationRow): Negotiation {
  return {
    // O uuid vem primeiro de propósito: é o valor que `simulations.negotiation_id`
    // e `orders.negotiation_id` referenciam, então precisa ser o id do domínio.
    id: row.id || row.external_id || row.number,
    number: row.number,
    client: row.client_name || "",
    owner: row.responsible_name || "",
    stage: (row.current_stage || "Oportunidade") as Negotiation["stage"],
    expectedValue: toNumber(row.total_value),
    marginPercent: toNumber(row.expected_margin),
    nextAction: row.next_action || "",
    status: (row.status || "Aberta") as Negotiation["status"],
  };
}

export function negotiationToRow(negotiation: Negotiation): Record<string, unknown> {
  return {
    external_id: negotiation.id,
    number: negotiation.number,
    client_name: negotiation.client,
    responsible_name: negotiation.owner,
    current_stage: negotiation.stage,
    status: negotiation.status,
    total_value: negotiation.expectedValue,
    expected_margin: negotiation.marginPercent,
    next_action: negotiation.nextAction,
  };
}
