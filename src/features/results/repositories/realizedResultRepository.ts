import type {
  CommissionApprovalStatus,
  RealizedResultRecord,
  RealizedResultStatus,
} from "@/data/types";

export interface RealizedResultRepository {
  list(): Promise<RealizedResultRecord[]>;
  save(result: RealizedResultRecord): Promise<RealizedResultRecord>;
}

export type RealizedResultRow = {
  id?: string;
  external_id?: string | null;
  order_external_id?: string | null;
  order_number?: string | null;
  client_name?: string | null;
  owner_name?: string | null;
  unit_name?: string | null;
  status?: string | null;
  order_total?: number | null;
  realized_revenue_total?: number | null;
  receivable_open_total?: number | null;
  cost_booked_total?: number | null;
  cost_paid_total?: number | null;
  commission_percent?: number | null;
  commission_total?: number | null;
  realized_profit?: number | null;
  projected_net_result?: number | null;
  predicted_margin_percent?: number | null;
  realized_margin_percent?: number | null;
  margin_delta_percent?: number | null;
  billing_progress?: number | null;
  payment_progress?: number | null;
  delivery_completed?: boolean | null;
  financial_completed?: boolean | null;
  commission_approval_status?: string | null;
  commission_approved_by?: string | null;
  commission_approved_at?: string | null;
  commission_notes?: string | null;
  closed_at?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function realizedResultToRow(result: RealizedResultRecord): Record<string, unknown> {
  return {
    external_id: result.id,
    order_external_id: result.orderId,
    order_number: result.orderNumber,
    client_name: result.client,
    owner_name: result.owner,
    unit_name: result.unit,
    status: result.status,
    order_total: result.orderTotal,
    realized_revenue_total: result.realizedRevenueTotal,
    receivable_open_total: result.receivableOpenTotal,
    cost_booked_total: result.costBookedTotal,
    cost_paid_total: result.costPaidTotal,
    commission_percent: result.commissionPercent,
    commission_total: result.commissionTotal,
    realized_profit: result.realizedProfit,
    projected_net_result: result.projectedNetResult,
    predicted_margin_percent: result.predictedMarginPercent,
    realized_margin_percent: result.realizedMarginPercent,
    margin_delta_percent: result.marginDeltaPercent,
    billing_progress: result.billingProgress,
    payment_progress: result.paymentProgress,
    delivery_completed: result.deliveryCompleted,
    financial_completed: result.financialCompleted,
    commission_approval_status: result.commissionApprovalStatus,
    commission_approved_by: result.commissionApprovedBy ?? null,
    commission_approved_at: result.commissionApprovedAt ?? null,
    commission_notes: result.commissionNotes || null,
    closed_at: result.closedAt ?? null,
    notes: result.notes || null,
    created_at: result.createdAt,
    updated_at: result.updatedAt,
  };
}

export function rowToRealizedResult(row: RealizedResultRow): RealizedResultRecord {
  const now = new Date().toISOString();
  return {
    id: row.external_id || row.id || crypto.randomUUID(),
    orderId: row.order_external_id || "",
    orderNumber: row.order_number || "",
    client: row.client_name || "",
    owner: row.owner_name || "",
    unit: row.unit_name || "",
    status: normalizeStatus(row.status),
    orderTotal: toNumber(row.order_total),
    realizedRevenueTotal: toNumber(row.realized_revenue_total),
    receivableOpenTotal: toNumber(row.receivable_open_total),
    costBookedTotal: toNumber(row.cost_booked_total),
    costPaidTotal: toNumber(row.cost_paid_total),
    commissionPercent: toNumber(row.commission_percent),
    commissionTotal: toNumber(row.commission_total),
    realizedProfit: toNumber(row.realized_profit),
    projectedNetResult: toNumber(row.projected_net_result),
    predictedMarginPercent: toNumber(row.predicted_margin_percent),
    realizedMarginPercent: toNumber(row.realized_margin_percent),
    marginDeltaPercent: toNumber(row.margin_delta_percent),
    billingProgress: toNumber(row.billing_progress),
    paymentProgress: toNumber(row.payment_progress),
    deliveryCompleted: Boolean(row.delivery_completed),
    financialCompleted: Boolean(row.financial_completed),
    commissionApprovalStatus: normalizeCommissionStatus(row.commission_approval_status),
    commissionApprovedBy: row.commission_approved_by ?? undefined,
    commissionApprovedAt: row.commission_approved_at ?? undefined,
    commissionNotes: row.commission_notes || "",
    closedAt: row.closed_at ?? undefined,
    notes: row.notes || "",
    createdAt: row.created_at || now,
    updatedAt: row.updated_at || now,
  };
}

function normalizeStatus(status?: string | null): RealizedResultStatus {
  if (status === "in_progress" || status === "closed" || status === "cancelled") return status;
  return "draft";
}

function normalizeCommissionStatus(status?: string | null): CommissionApprovalStatus {
  if (status === "approved" || status === "rejected") return status;
  return "pending";
}

function toNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
