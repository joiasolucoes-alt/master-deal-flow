import type { FinancialTitle } from "@/data/types";

export interface FinancialRepository {
  listTitles(): Promise<FinancialTitle[]>;
  saveTitle(title: FinancialTitle): Promise<FinancialTitle>;
}

export type FinancialTitleRow = {
  id?: string;
  external_id?: string | null;
  order_external_id?: string | null;
  order_number?: string | null;
  simulation_external_id?: string | null;
  simulation_number?: string | null;
  client_name?: string | null;
  title_number?: string | null;
  type?: string | null;
  status?: string | null;
  due_date?: string | null;
  amount?: number | null;
  paid_amount?: number | null;
  payment_method?: string | null;
  bank_name?: string | null;
  invoice_number?: string | null;
  invoice_issued_at?: string | null;
  proof_file_name?: string | null;
  proof_file_path?: string | null;
  proof_attached_at?: string | null;
  proof_attached_by?: string | null;
  notes?: string | null;
  owner_name?: string | null;
  unit_name?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
};

function toNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function financialTitleToRow(title: FinancialTitle): Record<string, unknown> {
  return {
    external_id: title.id,
    order_external_id: title.orderId ?? null,
    order_number: title.orderNumber ?? null,
    simulation_external_id: title.simulationId ?? null,
    simulation_number: title.simulationNumber ?? null,
    client_name: title.client,
    title_number: title.titleNumber,
    type: title.type,
    status: title.status,
    due_date: title.dueDate.slice(0, 10),
    amount: title.amount,
    paid_amount: title.paidAmount,
    payment_method: title.paymentMethod || null,
    bank_name: title.bankName || null,
    invoice_number: title.invoiceNumber ?? null,
    invoice_issued_at: title.invoiceIssuedAt?.slice(0, 10) ?? null,
    proof_file_name: title.proofFileName ?? null,
    proof_file_path: title.proofFilePath ?? null,
    proof_attached_at: title.proofAttachedAt ?? null,
    proof_attached_by: title.proofAttachedBy ?? null,
    notes: title.notes || null,
    owner_name: title.owner,
    unit_name: title.unit,
    created_at: title.createdAt,
    paid_at: title.paidAt ?? null,
  };
}

export function rowToFinancialTitle(row: FinancialTitleRow): FinancialTitle {
  return {
    id: row.external_id || row.id || row.title_number || crypto.randomUUID(),
    orderId: row.order_external_id ?? undefined,
    orderNumber: row.order_number ?? undefined,
    simulationId: row.simulation_external_id ?? undefined,
    simulationNumber: row.simulation_number ?? undefined,
    client: row.client_name || "",
    titleNumber: row.title_number || "",
    type: row.type === "payable" ? "payable" : "receivable",
    status:
      row.status === "paid" ||
      row.status === "partial" ||
      row.status === "overdue" ||
      row.status === "cancelled"
        ? row.status
        : "open",
    dueDate: row.due_date || new Date().toISOString(),
    amount: toNumber(row.amount),
    paidAmount: toNumber(row.paid_amount),
    paymentMethod: row.payment_method || "",
    bankName: row.bank_name || "",
    invoiceNumber: row.invoice_number ?? undefined,
    invoiceIssuedAt: row.invoice_issued_at ?? undefined,
    proofFileName: row.proof_file_name ?? undefined,
    proofFilePath: row.proof_file_path ?? undefined,
    proofAttachedAt: row.proof_attached_at ?? undefined,
    proofAttachedBy: row.proof_attached_by ?? undefined,
    notes: row.notes || "",
    owner: row.owner_name || "",
    unit: row.unit_name || "",
    createdAt: row.created_at || new Date().toISOString(),
    paidAt: row.paid_at ?? undefined,
  };
}
