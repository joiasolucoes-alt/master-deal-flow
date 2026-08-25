import type {
  ExpenseItem,
  FreightRecord,
  Order,
  RealizedResultRecord,
  Simulation,
  User,
} from "@/data/types";
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
  | "realized_result_reconciliation"
  | "closing_transfer";
export type WalletSourceModule =
  | "simulation"
  | "order"
  | "financial"
  | "freight"
  | "delivery"
  | "billing"
  | "manual"
  | "closing";

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
  managementDecision?: WalletManagementDecision;
  managementDecisionReason?: string;
  managementDecidedBy?: string;
  managementDecidedAt?: string;
  lossOwner?: WalletLossOwner;
  poolCoverageAmount?: number;
  poolCoverageReason?: string;
  poolCoveredBy?: string;
  poolCoveredAt?: string;
  createdAt: string;
  updatedAt: string;
  entries: NegotiationWalletEntry[];
}

export type WalletManagementDecision =
  | "pending"
  | "approved_for_pool"
  | "retained"
  | "loss_acknowledged"
  | "zero_acknowledged";

export type WalletLossOwner = "Master" | "Comercial" | "Transportadora" | "Fornecedor" | "Outro";

export type WalletBalanceOutcome = "positive" | "negative" | "zero";

export interface WalletManagementState {
  outcome: WalletBalanceOutcome;
  finalBalance: number;
  decision: WalletManagementDecision;
  isDecided: boolean;
  canTransfer: boolean;
}

export interface WalletLossCoverageState {
  lossAmount: number;
  coveredAmount: number;
  remainingAmount: number;
  canUsePool: boolean;
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

export type WalletReconciliationStatus =
  | "awaiting_realized_result"
  | "requires_adjustment"
  | "reconciled";

export interface WalletReconciliation {
  status: WalletReconciliationStatus;
  expectedProfit: number;
  walletBalance: number;
  realizedProfit?: number;
  difference: number;
  canClose: boolean;
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

export function canTransferWalletToPool(wallet: NegotiationWallet) {
  const finalBalance = wallet.finalBalance ?? getWalletTotals(wallet).balance;
  return (
    wallet.status === "closed" &&
    finalBalance > 0 &&
    wallet.managementDecision === "approved_for_pool"
  );
}

export function getWalletManagementState(wallet: NegotiationWallet): WalletManagementState {
  const finalBalance = roundCurrency(wallet.finalBalance ?? getWalletTotals(wallet).balance);
  const outcome: WalletBalanceOutcome =
    finalBalance > 0.01 ? "positive" : finalBalance < -0.01 ? "negative" : "zero";
  const decision = wallet.managementDecision ?? "pending";
  const validDecision =
    (outcome === "positive" && (decision === "approved_for_pool" || decision === "retained")) ||
    (outcome === "negative" && decision === "loss_acknowledged") ||
    (outcome === "zero" && decision === "zero_acknowledged");

  return {
    outcome,
    finalBalance,
    decision,
    isDecided: wallet.status === "transferred" || validDecision,
    canTransfer: wallet.status === "closed" && finalBalance > 0 && decision === "approved_for_pool",
  };
}

export function getWalletLossCoverage(wallet: NegotiationWallet): WalletLossCoverageState {
  const finalBalance = roundCurrency(wallet.finalBalance ?? getWalletTotals(wallet).balance);
  const lossAmount = roundCurrency(Math.max(0, -finalBalance));
  const coveredAmount = roundCurrency(
    Math.min(lossAmount, Math.max(0, wallet.poolCoverageAmount ?? 0)),
  );
  const remainingAmount = roundCurrency(Math.max(0, lossAmount - coveredAmount));

  return {
    lossAmount,
    coveredAmount,
    remainingAmount,
    canUsePool:
      wallet.status === "closed" &&
      wallet.managementDecision === "loss_acknowledged" &&
      wallet.lossOwner === "Master" &&
      remainingAmount > 0,
  };
}

export function prepareWalletLossCoverage({
  wallet,
  pool,
  amount,
  reason,
  user,
  requestId,
}: {
  wallet: NegotiationWallet;
  pool: OpportunityPool;
  amount: number;
  reason: string;
  user?: User | null;
  requestId: string;
}) {
  const coverage = getWalletLossCoverage(wallet);
  const normalizedAmount = roundCurrency(amount);
  if (!coverage.canUsePool) {
    throw new Error("Somente prejuízo assumido pela Master pode ser coberto pelo Pool.");
  }
  if (!reason.trim()) throw new Error("Informe o motivo da compensação.");
  if (normalizedAmount <= 0) throw new Error("Informe um valor maior que zero.");
  if (normalizedAmount > coverage.remainingAmount) {
    throw new Error("O valor não pode ser maior que o prejuízo restante.");
  }
  if (normalizedAmount > pool.balance) {
    throw new Error("O Pool não possui saldo suficiente para esta compensação.");
  }
  if (!requestId.trim()) throw new Error("A compensação precisa de uma identificação única.");

  const now = new Date().toISOString();
  const entryId = `pool-loss-coverage-${requestId}`;
  if (pool.entries.some((entry) => entry.id === entryId)) {
    throw new Error("Esta compensação já foi registrada.");
  }

  const entry: OpportunityPoolEntry = {
    id: entryId,
    poolId: pool.id,
    walletId: wallet.id,
    organizationId: wallet.organizationId,
    amount: normalizedAmount,
    direction: "debit",
    description: `Compensação do prejuízo da carteira do pedido ${wallet.orderId}.`,
    createdBy: user?.name ?? user?.email ?? "Admin",
    createdAt: now,
    metadata: {
      orderId: wallet.orderId,
      reason: reason.trim(),
      requestId,
      coverageBefore: coverage.coveredAmount,
      coverageAfter: roundCurrency(coverage.coveredAmount + normalizedAmount),
    },
  };
  const entries = [entry, ...pool.entries];
  const balance = roundCurrency(
    entries.reduce(
      (sum, item) => sum + (item.direction === "credit" ? item.amount : -item.amount),
      0,
    ),
  );

  return {
    wallet: {
      ...wallet,
      poolCoverageAmount: roundCurrency(coverage.coveredAmount + normalizedAmount),
      poolCoverageReason: reason.trim(),
      poolCoveredBy: user?.name ?? user?.email ?? "Admin",
      poolCoveredAt: now,
      updatedAt: now,
    },
    pool: { ...pool, entries, balance, updatedAt: now },
    entry,
  };
}

export function recordWalletManagementDecision({
  wallet,
  decision,
  reason,
  lossOwner,
  user,
}: {
  wallet: NegotiationWallet;
  decision: Exclude<WalletManagementDecision, "pending">;
  reason: string;
  lossOwner?: WalletLossOwner;
  user?: User | null;
}) {
  if (wallet.status !== "closed") {
    throw new Error("A carteira precisa estar encerrada antes da decisão gerencial.");
  }
  if (!reason.trim()) throw new Error("Informe o motivo da decisão gerencial.");

  const { outcome } = getWalletManagementState(wallet);
  const validDecision =
    (outcome === "positive" && (decision === "approved_for_pool" || decision === "retained")) ||
    (outcome === "negative" && decision === "loss_acknowledged") ||
    (outcome === "zero" && decision === "zero_acknowledged");
  if (!validDecision) throw new Error("A decisão não corresponde ao saldo final da carteira.");
  if (outcome === "negative" && !lossOwner) {
    throw new Error("Informe quem será responsável pelo prejuízo.");
  }

  const now = new Date().toISOString();
  return {
    ...wallet,
    managementDecision: decision,
    managementDecisionReason: reason.trim(),
    managementDecidedBy: user?.name ?? user?.email ?? "Admin",
    managementDecidedAt: now,
    lossOwner: outcome === "negative" ? lossOwner : undefined,
    updatedAt: now,
  };
}

export function getWalletReconciliation(
  wallet: NegotiationWallet,
  realizedResult?: RealizedResultRecord,
): WalletReconciliation {
  const walletBalance = getWalletTotals(wallet).balance;
  if (!realizedResult || realizedResult.status !== "closed") {
    return {
      status: "awaiting_realized_result",
      expectedProfit: wallet.initialExpectedProfit,
      walletBalance,
      difference: 0,
      canClose: false,
    };
  }

  const realizedProfit = roundCurrency(realizedResult.realizedProfit);
  const difference = roundCurrency(realizedProfit - walletBalance);
  const reconciled = Math.abs(difference) <= 0.01;
  return {
    status: reconciled ? "reconciled" : "requires_adjustment",
    expectedProfit: wallet.initialExpectedProfit,
    walletBalance,
    realizedProfit,
    difference,
    canClose: reconciled,
  };
}

export function reconcileWalletWithRealizedResult({
  wallet,
  realizedResult,
  user,
}: {
  wallet: NegotiationWallet;
  realizedResult: RealizedResultRecord;
  user?: User | null;
}) {
  if (realizedResult.status !== "closed") {
    throw new Error("O resultado realizado precisa estar fechado antes da conferência.");
  }
  if (wallet.status === "transferred" || wallet.status === "cancelled") {
    throw new Error("Esta carteira não pode mais ser conciliada.");
  }

  const reconciliationEntryId = `wallet-reconciliation-${wallet.id}`;
  const walletWithoutPreviousReconciliation = recalculateWallet({
    ...wallet,
    entries: wallet.entries.filter((entry) => entry.id !== reconciliationEntryId),
  });
  const balanceBeforeReconciliation = getWalletTotals(walletWithoutPreviousReconciliation).balance;
  const realizedProfit = roundCurrency(realizedResult.realizedProfit);
  const difference = roundCurrency(realizedProfit - balanceBeforeReconciliation);

  if (Math.abs(difference) <= 0.01) return walletWithoutPreviousReconciliation;

  return upsertWalletEntry(walletWithoutPreviousReconciliation, {
    id: reconciliationEntryId,
    walletId: wallet.id,
    organizationId: wallet.organizationId,
    simulationId: wallet.simulationId,
    orderId: wallet.orderId,
    entryType: "closing",
    category: "realized_result_reconciliation",
    sourceModule: "closing",
    amount: Math.abs(difference),
    direction: difference > 0 ? "credit" : "debit",
    description: "Conciliação entre a carteira e o resultado realizado do pedido",
    referenceId: realizedResult.id,
    metadata: {
      expectedProfit: wallet.initialExpectedProfit,
      balanceBeforeReconciliation,
      realizedProfit,
      resultClosedAt: realizedResult.closedAt,
    },
    createdBy: user?.id ?? user?.email,
    createdAt: new Date().toISOString(),
  });
}

export function transferWalletToPool(wallet: NegotiationWallet): NegotiationWallet {
  if (!canTransferWalletToPool(wallet)) {
    throw new Error("Somente carteiras encerradas com saldo positivo podem ir para o pool.");
  }

  return recalculateWallet({
    ...wallet,
    status: "transferred",
    finalBalance: wallet.finalBalance ?? getWalletTotals(wallet).balance,
  });
}

export function prepareWalletTransferToPool({
  wallet,
  pool,
  user,
}: {
  wallet: NegotiationWallet;
  pool?: OpportunityPool;
  user?: User | null;
}) {
  if (!canTransferWalletToPool(wallet)) {
    throw new Error("O saldo positivo precisa ser aprovado pelo Admin antes da transferência.");
  }

  const now = new Date().toISOString();
  const amount = roundCurrency(wallet.finalBalance ?? getWalletTotals(wallet).balance);
  const targetPool: OpportunityPool = pool ?? {
    id: "pool-geral",
    organizationId: wallet.organizationId,
    name: "Resultado Acumulado",
    description: "Saldos positivos aprovados das carteiras de negociação.",
    balance: 0,
    status: "active",
    createdAt: now,
    updatedAt: now,
    entries: [],
  };
  const entryId = `pool-transfer-${wallet.id}`;
  const entry: OpportunityPoolEntry = {
    id: entryId,
    poolId: targetPool.id,
    walletId: wallet.id,
    organizationId: wallet.organizationId,
    amount,
    direction: "credit",
    description: `Saldo aprovado da carteira do pedido ${wallet.orderId}.`,
    createdBy: user?.name ?? user?.email,
    createdAt: now,
    metadata: {
      orderId: wallet.orderId,
      decisionReason: wallet.managementDecisionReason,
      decidedBy: wallet.managementDecidedBy,
      decidedAt: wallet.managementDecidedAt,
    },
  };
  const entries = targetPool.entries.some((item) => item.id === entryId)
    ? targetPool.entries.map((item) => (item.id === entryId ? entry : item))
    : [entry, ...targetPool.entries];
  const balance = roundCurrency(
    entries.reduce(
      (sum, item) => sum + (item.direction === "credit" ? item.amount : -item.amount),
      0,
    ),
  );

  return {
    wallet: transferWalletToPool(wallet),
    pool: { ...targetPool, entries, balance, updatedAt: now },
  };
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
    managementDecision: "pending",
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
