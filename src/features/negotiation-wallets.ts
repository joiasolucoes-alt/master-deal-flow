import type { ExpenseItem, FreightRecord, Order, Simulation, User } from "@/data/types";
import { getExpenseTotal, getSimulationTotals } from "@/lib/calculations";

export type NegotiationWalletStatus = "open" | "locked" | "closed" | "transferred" | "cancelled";
export type WalletEntryDirection = "credit" | "debit";
export type WalletEntryCategory =
  | "freight_saving"
  | "freight_extra_cost"
  | "financial_cost_adjustment"
  | "boleto_delay_cost"
  | "commission_adjustment"
  | "fiscal_cost_adjustment"
  | "discount_given"
  | "price_adjustment"
  | "unloading_cost"
  | "chapa_cost"
  | "operational_extra_cost"
  | "supplier_cost_change"
  | "customer_payment_adjustment"
  | "manual_adjustment"
  | "closing_transfer";
export type WalletSourceModule =
  "simulation" | "order" | "financial" | "freight" | "delivery" | "billing" | "manual" | "closing";

export interface NegotiationWalletEntry {
  id: string;
  walletId: string;
  organizationId: string;
  negotiationId?: string;
  simulationId?: string;
  orderId: string;
  entryType: "automatic" | "manual" | "reversal" | "transfer" | "closing";
  category: WalletEntryCategory;
  sourceModule: WalletSourceModule;
  amount: number;
  direction: WalletEntryDirection;
  description: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string;
  createdAt: string;
  reversedAt?: string;
  reversedBy?: string;
  reversalReason?: string;
}

export interface NegotiationWallet {
  id: string;
  organizationId: string;
  negotiationId?: string;
  simulationId?: string;
  orderId: string;
  initialExpectedProfit: number;
  currentBalance: number;
  finalBalance?: number;
  status: NegotiationWalletStatus;
  openedAt: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  entries: NegotiationWalletEntry[];
}

export interface OpportunityPoolEntry {
  id: string;
  poolId: string;
  walletId?: string;
  organizationId: string;
  amount: number;
  direction: WalletEntryDirection;
  description: string;
  createdBy?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface OpportunityPool {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  balance: number;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  entries: OpportunityPoolEntry[];
}

export function getWalletTotals(wallet: NegotiationWallet) {
  const activeEntries = wallet.entries.filter((entry) => !entry.reversedAt);
  const credits = activeEntries
    .filter((entry) => entry.direction === "credit")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const debits = activeEntries
    .filter((entry) => entry.direction === "debit")
    .reduce((sum, entry) => sum + entry.amount, 0);
  return {
    credits,
    debits,
    balance: roundCurrency(wallet.initialExpectedProfit + credits - debits),
  };
}

export function recalculateWallet(wallet: NegotiationWallet): NegotiationWallet {
  const totals = getWalletTotals(wallet);
  return { ...wallet, currentBalance: totals.balance, updatedAt: new Date().toISOString() };
}

export function createWalletFromSimulationOrder({
  simulation,
  order,
  organizationId,
}: {
  simulation: Simulation;
  order: Order;
  organizationId: string;
}): NegotiationWallet {
  const now = new Date().toISOString();
  const initialExpectedProfit = roundCurrency(getSimulationTotals(simulation).netProfit);
  return {
    id: `wallet-${order.id}`,
    organizationId,
    simulationId: simulation.id,
    orderId: order.id,
    initialExpectedProfit,
    currentBalance: initialExpectedProfit,
    status: "open",
    openedAt: now,
    createdAt: now,
    updatedAt: now,
    entries: [],
  };
}

export function createWalletEntry(input: Omit<NegotiationWalletEntry, "id" | "createdAt">) {
  return {
    ...input,
    id: `went-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
}

export function upsertWalletEntry(wallet: NegotiationWallet, entry: NegotiationWalletEntry) {
  const entries = wallet.entries.some((item) => item.id === entry.id)
    ? wallet.entries.map((item) => (item.id === entry.id ? entry : item))
    : [entry, ...wallet.entries];
  return recalculateWallet({ ...wallet, entries });
}

export function createFreightWalletEntry({
  wallet,
  simulation,
  freight,
  user,
}: {
  wallet: NegotiationWallet;
  simulation?: Simulation;
  freight: FreightRecord;
  user?: User | null;
}) {
  const expectedFreight = getExpectedExpense(simulation, "Frete");
  if (expectedFreight <= 0 || freight.freightValue <= 0) return null;
  const difference = roundCurrency(expectedFreight - freight.freightValue);
  if (difference === 0) return null;
  return createWalletEntry({
    walletId: wallet.id,
    organizationId: wallet.organizationId,
    simulationId: wallet.simulationId,
    orderId: wallet.orderId,
    entryType: "automatic",
    category: difference > 0 ? "freight_saving" : "freight_extra_cost",
    sourceModule: "freight",
    amount: Math.abs(difference),
    direction: difference > 0 ? "credit" : "debit",
    description:
      difference > 0
        ? "Economia na contratação do frete em relação ao valor previsto"
        : "Custo adicional de frete em relação ao valor previsto",
    referenceId: freight.id,
    metadata: { expectedFreight, hiredFreight: freight.freightValue, freightCode: freight.code },
    createdBy: user?.id ?? user?.email,
  });
}

export function reverseEntriesByReference(
  wallet: NegotiationWallet,
  referenceId: string,
  user?: User | null,
  reason = "Substituído por novo lançamento automático",
) {
  return recalculateWallet({
    ...wallet,
    entries: wallet.entries.map((entry) =>
      entry.referenceId === referenceId && !entry.reversedAt
        ? {
            ...entry,
            reversedAt: new Date().toISOString(),
            reversedBy: user?.id ?? user?.email,
            reversalReason: reason,
          }
        : entry,
    ),
  });
}

export function getExpectedExpense(simulation: Simulation | undefined, type: ExpenseItem["type"]) {
  if (!simulation) return 0;
  const totals = getSimulationTotals(simulation);
  const bases = {
    revenue: totals.revenue,
    purchaseTotal: totals.purchaseTotal,
    grossProfit: totals.grossProfit,
  };
  return roundCurrency(
    simulation.expenseItems
      .filter((expense) => expense.type === type)
      .reduce((sum, expense) => sum + getExpenseTotal(expense, bases), 0),
  );
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
