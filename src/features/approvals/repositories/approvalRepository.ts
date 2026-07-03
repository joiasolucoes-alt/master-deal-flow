export type ApprovalStatus = "pending" | "approved" | "adjustment_requested" | "rejected";

export type ApprovalRecord = {
  id: string;
  simulationId: string;
  approverId?: string;
  status: ApprovalStatus;
  checklist?: Record<string, unknown>;
  comment?: string;
  requestedChanges?: Record<string, unknown>;
  decidedAt?: string;
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
  simulations?: { external_id?: string | null } | null;
  approver_id?: string | null;
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
    status: record.status,
    checklist: record.checklist ?? null,
    comment: record.comment ?? null,
    requested_changes: {
      ...(record.requestedChanges ?? {}),
      simulationExternalId: record.simulationId,
      decidedAt: record.decidedAt ?? null,
      approverExternalId: record.approverId ?? null,
    },
  };
}

export function rowToApproval(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.external_id || row.id || crypto.randomUUID(),
    simulationId:
      row.simulation_external_id ||
      row.simulations?.external_id ||
      (row.requested_changes?.simulationExternalId as string | undefined) ||
      "",
    approverId:
      row.approver_id || (row.requested_changes?.approverExternalId as string | undefined),
    status: row.status || "pending",
    checklist: row.checklist ?? undefined,
    comment: row.comment ?? undefined,
    requestedChanges: row.requested_changes ?? undefined,
    decidedAt: row.requested_changes?.decidedAt as string | undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}
