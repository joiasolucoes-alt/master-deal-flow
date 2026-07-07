import type {
  ExpenseItem,
  FreightRecord,
  NegotiationWallet,
  NegotiationWalletEntry,
  Order,
  Simulation,
} from "@/data/types";
import { getExpenseTotal, getSimulationTotals } from "@/lib/calculations";

const FREIGHT_EXPENSE_ALIASES = new Set([
  "frete",
  "fretes",
  "transporte",
  "logistica",
  "logística",
]);
const MONEY_EPSILON = 0.005;

export function createNegotiationWallet(order: Order, simulation: Simulation): NegotiationWallet {
  const now = new Date().toISOString();

  return {
    id: `wallet-${order.id}`,
    orderId: order.id,
    simulationId: simulation.id,
    orderNumber: order.number,
    client: order.client,
    createdAt: now,
    updatedAt: now,
    entries: [],
  };
}

export function ensureNegotiationWallet(
  wallets: NegotiationWallet[],
  order: Order,
  simulation?: Simulation,
) {
  const existing = wallets.find((wallet) => wallet.orderId === order.id);
  if (existing) return existing;
  if (!simulation) return null;
  return createNegotiationWallet(order, simulation);
}

export function getNegotiationWalletBalance(wallet?: NegotiationWallet | null) {
  if (!wallet) return 0;

  return wallet.entries.reduce((balance, entry) => {
    const signedAmount = entry.direction === "credit" ? entry.amount : -entry.amount;
    return balance + signedAmount;
  }, 0);
}

export function getExpectedExpense(simulation: Simulation, expenseType: ExpenseItem["type"]) {
  const totals = getSimulationTotals(simulation);
  const bases = {
    revenue: totals.revenue,
    purchaseTotal: totals.purchaseTotal,
    grossProfit: totals.grossProfit,
  };

  return simulation.expenseItems
    .filter((expense) => isSameExpenseType(expense.type, expenseType))
    .reduce((sum, expense) => sum + getExpenseTotal(expense, bases), 0);
}

export function createFreightWalletEntry(params: {
  freight: FreightRecord;
  expectedFreightValue: number;
}): NegotiationWalletEntry | null {
  const { freight, expectedFreightValue } = params;
  if (!freight.orderId) return null;
  if (expectedFreightValue <= 0) return null;

  const difference = roundMoney(expectedFreightValue - freight.freightValue);
  if (Math.abs(difference) < MONEY_EPSILON) return null;

  const isSaving = difference > 0;
  const amount = Math.abs(difference);

  return {
    id: `wallet-entry-${freight.id}-${Date.now()}`,
    orderId: freight.orderId,
    sourceModule: "freight",
    category: isSaving ? "freight_saving" : "freight_extra_cost",
    direction: isSaving ? "credit" : "debit",
    amount,
    description: isSaving
      ? `Economia de frete: contratado por ${formatMoneyForDescription(freight.freightValue)} versus previsto de ${formatMoneyForDescription(expectedFreightValue)}.`
      : `Custo extra de frete: contratado por ${formatMoneyForDescription(freight.freightValue)} versus previsto de ${formatMoneyForDescription(expectedFreightValue)}.`,
    referenceId: freight.id,
    occurredAt: new Date().toISOString(),
    metadata: {
      freightCode: freight.code,
      expectedFreightValue,
      contractedFreightValue: freight.freightValue,
      difference,
    },
  };
}

export function upsertFreightWalletEntry(
  wallet: NegotiationWallet,
  nextEntry: NegotiationWalletEntry | null,
  referenceId: string,
) {
  const now = new Date().toISOString();
  const activeEntries = wallet.entries.filter(
    (entry) =>
      entry.sourceModule === "freight" &&
      entry.referenceId === referenceId &&
      !entry.reversedEntryId &&
      !entry.reversalOfEntryId,
  );
  const untouchedEntries = wallet.entries.filter(
    (entry) =>
      !(
        entry.sourceModule === "freight" &&
        entry.referenceId === referenceId &&
        !entry.reversedEntryId &&
        !entry.reversalOfEntryId
      ),
  );

  const reversalEntries = activeEntries.map((entry) => createReversalEntry(entry, now));

  return {
    ...wallet,
    updatedAt: now,
    entries: [
      ...untouchedEntries,
      ...activeEntries.map((entry) => markEntryReversed(entry, now)),
      ...reversalEntries,
      ...(nextEntry ? [nextEntry] : []),
    ],
  };
}

export function applyFreightWalletEntry(params: {
  wallets: NegotiationWallet[];
  order: Order;
  simulation: Simulation;
  freight: FreightRecord;
}) {
  const wallet = ensureNegotiationWallet(params.wallets, params.order, params.simulation);
  if (!wallet) return null;

  const expectedFreightValue = getExpectedExpense(params.simulation, "Frete");
  const nextEntry = createFreightWalletEntry({
    freight: params.freight,
    expectedFreightValue,
  });

  return upsertFreightWalletEntry(wallet, nextEntry, params.freight.id);
}

function createReversalEntry(
  entry: NegotiationWalletEntry,
  occurredAt: string,
): NegotiationWalletEntry {
  return {
    ...entry,
    id: `wallet-reversal-${entry.id}-${Date.now()}`,
    direction: entry.direction === "credit" ? "debit" : "credit",
    description: `Estorno: ${entry.description}`,
    occurredAt,
    reversalOfEntryId: entry.id,
  };
}

function markEntryReversed(
  entry: NegotiationWalletEntry,
  occurredAt: string,
): NegotiationWalletEntry {
  return {
    ...entry,
    reversedEntryId: `reversed-${entry.id}-${occurredAt}`,
  };
}

function isSameExpenseType(left: ExpenseItem["type"], right: ExpenseItem["type"]) {
  const normalizedLeft = normalizeExpenseType(left);
  const normalizedRight = normalizeExpenseType(right);

  if (normalizedLeft === normalizedRight) return true;
  if (normalizedRight === "frete") return FREIGHT_EXPENSE_ALIASES.has(normalizedLeft);

  return false;
}

function normalizeExpenseType(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoneyForDescription(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
