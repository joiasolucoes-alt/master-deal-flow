import type { ApprovalStage } from "@/data/types";

export type ApprovalStatus = "pending" | "approved" | "adjustment_requested" | "rejected";

export type ApprovalRecord = {
  id: string;
  simulationId: string;
  stage?: ApprovalStage;
  approverId?: string;
  status: ApprovalStatus;
  checklist?: Record<string, unknown>;
  comment?: string;
  bankAccount?: string;
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
  stage?: ApprovalStage | null;
  status?: ApprovalStatus | null;
  checklist?: Record<string, unknown> | null;
  comment?: string | null;
  bank_account?: string | null;
  requested_changes?: Record<string, unknown> | null;
  decided_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function approvalToRow(record: ApprovalRecord): Record<string, unknown> {
  return {
    external_id: record.id,
    stage: record.stage ?? null,
    status: record.status,
    checklist: record.checklist ?? {},
    comment: record.comment ?? null,
    bank_account: record.bankAccount ?? null,
    decided_at: record.decidedAt ?? null,
    requested_changes: {
      ...(record.requestedChanges ?? {}),
      simulationExternalId: record.simulationId,
      stage: record.stage ?? null,
      bankAccount: record.bankAccount ?? null,
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
    stage: row.stage || (row.requested_changes?.stage as ApprovalStage | undefined),
    approverId:
      row.approver_id || (row.requested_changes?.approverExternalId as string | undefined),
    status: row.status || "pending",
    checklist: row.checklist ?? undefined,
    comment: row.comment ?? undefined,
    bankAccount: row.bank_account || (row.requested_changes?.bankAccount as string | undefined),
    requestedChanges: row.requested_changes ?? undefined,
    decidedAt: row.decided_at || (row.requested_changes?.decidedAt as string | undefined),
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}
