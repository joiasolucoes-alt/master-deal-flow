import type {
  ExpenseItem,
  FinancialData,
  PurchaseItem,
  Simulation,
  SimulationProduct,
  SimulationApprovalFlow,
  User,
} from "@/data/types";
import { ATTENTION_MARGIN_TARGET, MINIMUM_MARGIN_TARGET } from "@/lib/constants";
import { getSimulationTotals } from "@/lib/calculations";

export interface SimulationRepository {
  list(): Promise<Simulation[]>;
  listAdjustments?(user?: User | null): Promise<Simulation[]>;
  getById(id: string): Promise<Simulation | null>;
  save(simulation: Simulation): Promise<Simulation>;
}

export type SimulationRow = {
  id?: string;
  external_id?: string | null;
  number: string;
  negotiation_id?: string | null;
  client_name?: string | null;
  supplier_name?: string | null;
  responsible_name?: string | null;
  unit_name?: string | null;
  delivery_city?: string | null;
  delivery_state?: string | null;
  payment_condition?: string | null;
  expected_delivery_date?: string | null;
  valid_until?: string | null;
  status?: string | null;
  priority?: string | null;
  viability_status?: string | null;
  revenue_total?: number | null;
  goods_cost_total?: number | null;
  expenses_total?: number | null;
  gross_profit?: number | null;
  net_profit?: number | null;
  net_margin?: number | null;
  notes?: string | null;
  financial_notes?: string | null;
  financial?: Partial<FinancialData> | null;
  approval_checklist?: Simulation["approvalChecklist"] | null;
  approval_flow?: Simulation["approvalFlow"] | null;
  approval_notes?: string | null;
  adjustment_reason?: string | null;
  adjustment_requested_at?: string | null;
  adjustment_requested_by?: string | null;
  adjustment_stage?: "financial" | "principal" | null;
  payment_requested_at?: string | null;
  payment_paid_at?: string | null;
  payment_paid_by?: string | null;
  payment_receipt_file_name?: string | null;
  payment_receipt_file_path?: string | null;
  payment_receipt_attached_at?: string | null;
  payment_receipt_attached_by?: string | null;
  payment_validation_notes?: string | null;
  payment_validated_at?: string | null;
  payment_validated_by?: string | null;
  payment_adjustment_reason?: string | null;
  converted_order_external_id?: string | null;
  converted_at?: string | null;
  created_at?: string | null;
  simulation_items?: SimulationItemRow[];
  simulation_costs?: SimulationCostRow[];
  simulation_purchase_costs?: SimulationPurchaseCostRow[];
  simulation_installments?: SimulationInstallmentRow[];
  approvals?: SimulationApprovalRow[];
};

type SimulationApprovalRow = {
  stage?: "financial" | "principal" | null;
  status?: "pending" | "approved" | "adjustment_requested" | "rejected" | null;
  approver_id?: string | null;
  bank_account?: string | null;
  comment?: string | null;
  decided_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  requested_changes?: Record<string, unknown> | null;
};

export type SimulationItemRow = {
  external_id?: string | null;
  product_code?: string | null;
  product_description?: string | null;
  boxes_quantity?: number | null;
  units_per_box?: number | null;
  total_units?: number | null;
  unit_cost?: number | null;
  adjusted_unit_cost?: number | null;
  invoice_price?: number | null;
  sale_unit_price?: number | null;
  cost_total?: number | null;
  sale_total?: number | null;
};

export type SimulationCostRow = {
  external_id?: string | null;
  type?: string | null;
  calculation_method?: string | null;
  calculation_base?: ExpenseItem["calculationBase"] | null;
  percentage?: number | null;
  amount?: number | null;
};

export type SimulationPurchaseCostRow = {
  external_id?: string | null;
  type?: PurchaseItem["type"] | null;
  document?: string | null;
  supplier?: string | null;
  amount?: number | null;
  allocation_percent?: number | null;
};

export type SimulationInstallmentRow = {
  installment_number?: number | null;
  due_days?: number | null;
  due_date?: string | null;
  amount?: number | null;
  bank?: string | null;
};

const defaultFinancial: FinancialData = {
  installmentDays: [],
  bank: "",
  paymentMethod: "Boleto bancário",
  account: "",
  discountPercent: 0,
  notes: "",
};

function toNumber(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toDateTime(value: string | null | undefined) {
  return value || new Date().toISOString();
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `negotiation_id` é uuid (FK). Só persiste quando o valor é um uuid válido. */
function toNegotiationId(value: string | null | undefined) {
  return value && UUID_PATTERN.test(value) ? value : null;
}

function getApprovalRowTime(row: SimulationApprovalRow) {
  return row.decided_at || row.updated_at || row.created_at || "";
}

function getApprovalFlowFromRows(
  approvals: SimulationApprovalRow[] | undefined,
): SimulationApprovalFlow | undefined {
  if (!approvals?.length) return undefined;

  const flow: SimulationApprovalFlow = {
    financial: { status: "pending" },
    principal: { status: "pending" },
  };

  for (const stage of ["financial", "principal"] as const) {
    const latest = approvals
      .filter((approval) => approval.stage === stage)
      .sort((a, b) => getApprovalRowTime(b).localeCompare(getApprovalRowTime(a)))[0];

    if (!latest?.status) continue;

    flow[stage] = {
      status: latest.status,
      approverId:
        latest.approver_id ||
        (latest.requested_changes?.approverExternalId as string | undefined) ||
        undefined,
      decidedAt:
        latest.decided_at ||
        (latest.requested_changes?.decidedAt as string | undefined) ||
        undefined,
      notes: latest.comment ?? undefined,
      bankAccount:
        latest.bank_account ||
        (latest.requested_changes?.bankAccount as string | undefined) ||
        undefined,
    };
  }

  return flow;
}

function getLatestApprovalRow(approvals: SimulationApprovalRow[] | undefined) {
  return [...(approvals ?? [])].sort((a, b) =>
    getApprovalRowTime(b).localeCompare(getApprovalRowTime(a)),
  )[0];
}

function getStatusFromApprovalRows(
  status: string | null | undefined,
  approvals: SimulationApprovalRow[] | undefined,
): Simulation["status"] {
  if (status) return status as Simulation["status"];

  const latest = getLatestApprovalRow(approvals);

  if (latest?.status === "adjustment_requested") return "Ajuste solicitado";
  if (latest?.status === "rejected") return "Reprovada";

  return "Rascunho";
}

function getApprovalNotesFromRows(
  notes: string | null | undefined,
  approvals: SimulationApprovalRow[] | undefined,
) {
  const latest = getLatestApprovalRow(approvals);
  return notes || latest?.comment || undefined;
}

function getAdjustmentReasonFromRows(row: SimulationRow) {
  return row.adjustment_reason || getApprovalNotesFromRows(row.approval_notes, row.approvals);
}

function getAdjustmentRequestedAtFromRows(row: SimulationRow) {
  const latest = getLatestApprovalRow(row.approvals);
  return (
    row.adjustment_requested_at || latest?.decided_at || latest?.updated_at || latest?.created_at
  );
}

function getAdjustmentRequestedByFromRows(row: SimulationRow) {
  const latest = getLatestApprovalRow(row.approvals);
  return (
    row.adjustment_requested_by ||
    latest?.approver_id ||
    (latest?.requested_changes?.approverExternalId as string | undefined) ||
    undefined
  );
}

export function simulationToRow(simulation: Simulation): Record<string, unknown> {
  const totals = getSimulationTotals(simulation);

  return {
    external_id: simulation.id,
    number: simulation.number,
    negotiation_id: toNegotiationId(simulation.negotiationId),
    client_name: simulation.client,
    supplier_name: simulation.supplier,
    responsible_name: simulation.owner,
    unit_name: simulation.unit,
    delivery_city: simulation.deliveryCity,
    delivery_state: simulation.deliveryState,
    payment_condition: simulation.paymentCondition,
    expected_delivery_date: simulation.deliveryDate.slice(0, 10),
    valid_until: simulation.validUntil,
    status: simulation.status,
    priority: simulation.priority,
    viability_status: totals.viability,
    revenue_total: totals.revenue,
    goods_cost_total: totals.merchandiseCost,
    expenses_total: totals.expenses,
    gross_profit: totals.grossProfit,
    net_profit: totals.netProfit,
    net_margin: totals.marginPercent,
    minimum_margin: MINIMUM_MARGIN_TARGET || ATTENTION_MARGIN_TARGET,
    notes: simulation.notes,
    financial_notes: simulation.financialNotes ?? null,
    financial: simulation.financial,
    approval_checklist: simulation.approvalChecklist ?? null,
    approval_flow: simulation.approvalFlow ?? null,
    approval_notes: simulation.approvalNotes ?? null,
    adjustment_reason:
      simulation.status === "Ajuste solicitado"
        ? (simulation.adjustmentReason ?? simulation.approvalNotes ?? null)
        : null,
    adjustment_requested_at:
      simulation.status === "Ajuste solicitado" ? (simulation.adjustmentRequestedAt ?? null) : null,
    adjustment_requested_by:
      simulation.status === "Ajuste solicitado" ? (simulation.adjustmentRequestedBy ?? null) : null,
    adjustment_stage:
      simulation.status === "Ajuste solicitado" ? (simulation.adjustmentStage ?? null) : null,
    payment_requested_at: simulation.paymentRequestedAt ?? null,
    payment_paid_at: simulation.paymentPaidAt ?? null,
    payment_paid_by: simulation.paymentPaidBy ?? null,
    payment_receipt_file_name: simulation.paymentReceiptFileName ?? null,
    payment_receipt_file_path: simulation.paymentReceiptFilePath ?? null,
    payment_receipt_attached_at: simulation.paymentReceiptAttachedAt ?? null,
    payment_receipt_attached_by: simulation.paymentReceiptAttachedBy ?? null,
    payment_validation_notes: simulation.paymentValidationNotes ?? null,
    payment_validated_at: simulation.paymentValidatedAt ?? null,
    payment_validated_by: simulation.paymentValidatedBy ?? null,
    payment_adjustment_reason: simulation.paymentAdjustmentReason ?? null,
    converted_order_external_id: simulation.orderId ?? null,
    converted_at: simulation.convertedAt ?? null,
    created_at: simulation.createdAt,
  };
}

export function productToSimulationItemRow(
  product: SimulationProduct,
  simulationId: string,
): Record<string, unknown> {
  const costTotal = product.costTotal ?? product.quantityTotal * product.costUnit;
  const saleTotal = product.saleTotal ?? product.quantityTotal * product.saleUnit;
  const grossProfit = saleTotal - costTotal;
  const margin = saleTotal > 0 ? (grossProfit / saleTotal) * 100 : 0;

  return {
    external_id: product.id,
    simulation_id: simulationId,
    product_code: product.code,
    product_description: product.product,
    boxes_quantity: product.boxes,
    units_per_box: product.unitsPerBox,
    total_units: product.quantityTotal,
    unit_cost: product.costUnit,
    adjusted_unit_cost: product.costUnit,
    invoice_price: product.invoicePrice ?? null,
    sale_unit_price: product.saleUnit,
    cost_total: costTotal,
    sale_total: saleTotal,
    gross_profit: grossProfit,
    margin,
  };
}

export function expenseToSimulationCostRow(
  expense: ExpenseItem,
  simulationId: string,
): Record<string, unknown> {
  return {
    external_id: expense.id,
    simulation_id: simulationId,
    type: expense.type,
    calculation_method: expense.calculationType,
    calculation_base: expense.calculationBase ?? null,
    percentage: expense.calculationType === "percentage" ? expense.value : null,
    amount: expense.value,
  };
}

export function purchaseToSimulationPurchaseCostRow(
  purchase: PurchaseItem,
  simulationId: string,
): Record<string, unknown> {
  return {
    external_id: purchase.id,
    simulation_id: simulationId,
    type: purchase.type,
    document: purchase.document,
    supplier: purchase.supplier,
    amount: purchase.value,
    allocation_percent: purchase.allocationPercent,
  };
}

export function installmentToRow(
  day: number,
  index: number,
  simulationId: string,
  amount: number,
  bank?: string,
): Record<string, unknown> {
  return {
    simulation_id: simulationId,
    installment_number: index + 1,
    due_days: day,
    amount,
    bank: bank || null,
  };
}

export function rowToSimulation(row: SimulationRow): Simulation {
  const installments = [...(row.simulation_installments ?? [])].sort(
    (a, b) => toNumber(a.installment_number) - toNumber(b.installment_number),
  );
  const financial: FinancialData = {
    ...defaultFinancial,
    ...(row.financial ?? {}),
    installmentDays:
      row.financial?.installmentDays ??
      installments.map((installment) => toNumber(installment.due_days)),
    bank: row.financial?.bank ?? installments.find((installment) => installment.bank)?.bank ?? "",
  };

  return {
    id: row.external_id || row.id || row.number,
    number: row.number,
    negotiationId: row.negotiation_id ?? undefined,
    client: row.client_name || "",
    supplier: row.supplier_name || "",
    deliveryCity: row.delivery_city || "",
    deliveryState: row.delivery_state || "",
    owner: row.responsible_name || "",
    unit: row.unit_name || "",
    paymentCondition: row.payment_condition || "",
    deliveryDate: row.expected_delivery_date || toDateTime(row.created_at),
    createdAt: toDateTime(row.created_at),
    validUntil: toDateTime(row.valid_until),
    notes: row.notes || "",
    financialNotes: row.financial_notes || undefined,
    status: getStatusFromApprovalRows(row.status, row.approvals),
    priority: (row.priority || "Média") as Simulation["priority"],
    products: (row.simulation_items ?? []).map(rowToProduct),
    purchaseItems: (row.simulation_purchase_costs ?? []).map(rowToPurchase),
    expenseItems: (row.simulation_costs ?? []).map(rowToExpense),
    financial,
    approvalChecklist: row.approval_checklist ?? undefined,
    approvalFlow: row.approval_flow ?? getApprovalFlowFromRows(row.approvals),
    approvalNotes: getApprovalNotesFromRows(row.approval_notes, row.approvals),
    adjustmentReason: getAdjustmentReasonFromRows(row),
    adjustmentRequestedAt: getAdjustmentRequestedAtFromRows(row) ?? undefined,
    adjustmentRequestedBy: getAdjustmentRequestedByFromRows(row) ?? undefined,
    adjustmentStage: row.adjustment_stage ?? undefined,
    paymentRequestedAt: row.payment_requested_at ?? undefined,
    paymentPaidAt: row.payment_paid_at ?? undefined,
    paymentPaidBy: row.payment_paid_by ?? undefined,
    paymentReceiptFileName: row.payment_receipt_file_name ?? undefined,
    paymentReceiptFilePath: row.payment_receipt_file_path ?? undefined,
    paymentReceiptAttachedAt: row.payment_receipt_attached_at ?? undefined,
    paymentReceiptAttachedBy: row.payment_receipt_attached_by ?? undefined,
    paymentValidationNotes: row.payment_validation_notes ?? undefined,
    paymentValidatedAt: row.payment_validated_at ?? undefined,
    paymentValidatedBy: row.payment_validated_by ?? undefined,
    paymentAdjustmentReason: row.payment_adjustment_reason ?? undefined,
    orderId: row.converted_order_external_id ?? undefined,
    convertedAt: row.converted_at ?? undefined,
  };
}

function rowToProduct(row: SimulationItemRow): SimulationProduct {
  return {
    id: row.external_id || crypto.randomUUID(),
    code: row.product_code || "",
    product: row.product_description || "",
    boxes: toNumber(row.boxes_quantity),
    unitsPerBox: toNumber(row.units_per_box),
    quantityTotal: toNumber(row.total_units),
    costUnit: toNumber(row.unit_cost),
    costTotal: row.cost_total ?? undefined,
    invoicePrice: row.invoice_price ?? undefined,
    saleUnit: toNumber(row.sale_unit_price),
    saleTotal: row.sale_total ?? undefined,
  };
}

function rowToPurchase(row: SimulationPurchaseCostRow): PurchaseItem {
  return {
    id: row.external_id || crypto.randomUUID(),
    type: (row.type || "Outros") as PurchaseItem["type"],
    document: row.document || "",
    supplier: row.supplier || "",
    value: toNumber(row.amount),
    allocationPercent: toNumber(row.allocation_percent, 100),
  };
}

function rowToExpense(row: SimulationCostRow): ExpenseItem {
  const calculationType = row.calculation_method === "percentage" ? "percentage" : "fixed";

  return {
    id: row.external_id || crypto.randomUUID(),
    type: (row.type || "Outros") as ExpenseItem["type"],
    calculationType,
    calculationBase: row.calculation_base ?? undefined,
    value: calculationType === "percentage" ? toNumber(row.percentage) : toNumber(row.amount),
  };
}
