export type ApprovalStatus = "pending" | "approved" | "adjustment_requested" | "rejected";

export type ApprovalRecord = {
  id: string;
  simulationId: string;
  status: ApprovalStatus;
  checklist?: Record<string, unknown>;
  comment?: string;
  requestedChanges?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export interface ApprovalRepository {
  listPending(): Promise<ApprovalRecord[]>;
  save(record: ApprovalRecord): Promise<ApprovalRecord>;
}

export type ApprovalRow = {
  id?: string;
  external_id?: string | null;
  simulation_external_id?: string | null;
  status?: ApprovalStatus | null;
  checklist?: Record<string, unknown> | null;
  comment?: string | null;
  requested_changes?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function approvalToRow(record: ApprovalRecord): Record<string, unknown> {
  return {
    external_id: record.id,
    simulation_external_id: record.simulationId,
    status: record.status,
    checklist: record.checklist ?? null,
    comment: record.comment ?? null,
    requested_changes: record.requestedChanges ?? null,
  };
}

export function rowToApproval(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.external_id || row.id || crypto.randomUUID(),
    simulationId: row.simulation_external_id || "",
    status: row.status || "pending",
    checklist: row.checklist ?? undefined,
    comment: row.comment ?? undefined,
    requestedChanges: row.requested_changes ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}
