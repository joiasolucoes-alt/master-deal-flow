import type { Negotiation } from "@/data/types";

export interface NegotiationRepository {
  list(): Promise<Negotiation[]>;
  save(negotiation: Negotiation): Promise<Negotiation>;
}

export type NegotiationRow = {
  id?: string;
  external_id?: string | null;
  number?: string | null;
  current_stage?: string | null;
  stage?: string | null;
  status?: string | null;
  total_value?: number | null;
  expected_value?: number | null;
  expected_margin?: number | null;
  margin_percent?: number | null;
  next_action?: string | null;
  clients?: { name?: string | null } | null;
  profiles?: { full_name?: string | null; name?: string | null; email?: string | null } | null;
};

function toNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeStage(stage?: string | null): Negotiation["stage"] {
  if (
    stage === "Oportunidade" ||
    stage === "Simulação" ||
    stage === "Aprovação" ||
    stage === "Pedido" ||
    stage === "Concluída" ||
    stage === "Cancelada"
  ) {
    return stage;
  }
  return "Simulação";
}

function normalizeStatus(status?: string | null): Negotiation["status"] {
  if (
    status === "Aberta" ||
    status === "Aguardando definição" ||
    status === "Aprovada" ||
    status === "Convertida" ||
    status === "Cancelada"
  ) {
    return status;
  }
  return "Aberta";
}

export function rowToNegotiation(row: NegotiationRow): Negotiation {
  return {
    id: row.external_id || row.id || row.number || crypto.randomUUID(),
    number: row.number || "",
    client: row.clients?.name || "Cliente não vinculado",
    owner:
      row.profiles?.full_name || row.profiles?.name || row.profiles?.email || "Sem responsável",
    stage: normalizeStage(row.current_stage ?? row.stage),
    expectedValue: toNumber(row.expected_value ?? row.total_value),
    marginPercent: toNumber(row.expected_margin ?? row.margin_percent),
    nextAction: row.next_action || "Definir próxima ação",
    status: normalizeStatus(row.status),
  };
}
