import type {
  ExpenseItem,
  FinancialData,
  PurchaseItem,
  Simulation,
  SimulationProduct,
} from "@/data/types";
import { ATTENTION_MARGIN_TARGET, MINIMUM_MARGIN_TARGET } from "@/lib/constants";
import { getSimulationTotals } from "@/lib/calculations";

export interface SimulationRepository {
  list(): Promise<Simulation[]>;
  getById(id: string): Promise<Simulation | null>;
  save(simulation: Simulation): Promise<Simulation>;
}

export type SimulationRow = {
  id?: string;
  external_id?: string | null;
  number: string;
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
  approval_notes?: string | null;
  converted_order_external_id?: string | null;
  converted_at?: string | null;
  created_at?: string | null;
  simulation_items?: SimulationItemRow[];
  simulation_costs?: SimulationCostRow[];
  simulation_purchase_costs?: SimulationPurchaseCostRow[];
  simulation_installments?: SimulationInstallmentRow[];
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

export function simulationToRow(simulation: Simulation): Record<string, unknown> {
  const totals = getSimulationTotals(simulation);

  return {
    external_id: simulation.id,
    number: simulation.number,
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
    approval_notes: simulation.approvalNotes ?? null,
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
    status: (row.status || "Rascunho") as Simulation["status"],
    priority: (row.priority || "Média") as Simulation["priority"],
    products: (row.simulation_items ?? []).map(rowToProduct),
    purchaseItems: (row.simulation_purchase_costs ?? []).map(rowToPurchase),
    expenseItems: (row.simulation_costs ?? []).map(rowToExpense),
    financial,
    approvalChecklist: row.approval_checklist ?? undefined,
    approvalNotes: row.approval_notes ?? undefined,
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
