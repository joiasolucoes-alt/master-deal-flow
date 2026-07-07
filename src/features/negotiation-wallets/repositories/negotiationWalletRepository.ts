import type {
  NegotiationWallet,
  NegotiationWalletEntry,
  NegotiationWalletEntryCategory,
  NegotiationWalletEntryDirection,
  NegotiationWalletSourceModule,
} from "@/data/types";

export interface NegotiationWalletRepository {
  list(): Promise<NegotiationWallet[]>;
  save(wallet: NegotiationWallet): Promise<NegotiationWallet>;
}

export type NegotiationWalletRow = {
  id?: string;
  external_id?: string | null;
  order_external_id?: string | null;
  simulation_external_id?: string | null;
  order_number?: string | null;
  client_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  negotiation_wallet_entries?: NegotiationWalletEntryRow[] | null;
};

export type NegotiationWalletEntryRow = {
  external_id?: string | null;
  order_external_id?: string | null;
  source_module?: string | null;
  category?: string | null;
  direction?: string | null;
  amount?: number | null;
  description?: string | null;
  reference_id?: string | null;
  occurred_at?: string | null;
  reversal_of_entry_external_id?: string | null;
  reversed_entry_external_id?: string | null;
  metadata?: NegotiationWalletEntry["metadata"] | null;
};

function toNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeSourceModule(value?: string | null): NegotiationWalletSourceModule {
  return value === "freight" ? value : "freight";
}

function normalizeCategory(value?: string | null): NegotiationWalletEntryCategory {
  return value === "freight_extra_cost" ? value : "freight_saving";
}

function normalizeDirection(value?: string | null): NegotiationWalletEntryDirection {
  return value === "debit" ? value : "credit";
}

export function walletToRow(
  wallet: NegotiationWallet,
  keys?: {
    organizationId?: string | null;
    unitId?: string | null;
    orderUuid?: string | null;
  },
): Record<string, unknown> {
  return {
    external_id: wallet.id,
    organization_id: keys?.organizationId ?? null,
    unit_id: keys?.unitId ?? null,
    order_id: keys?.orderUuid ?? null,
    order_external_id: wallet.orderId,
    simulation_external_id: wallet.simulationId,
    order_number: wallet.orderNumber,
    client_name: wallet.client,
    created_at: wallet.createdAt,
    updated_at: wallet.updatedAt,
  };
}

export function entryToRow(
  entry: NegotiationWalletEntry,
  walletUuid: string,
): Record<string, unknown> {
  return {
    external_id: entry.id,
    wallet_id: walletUuid,
    order_external_id: entry.orderId,
    source_module: entry.sourceModule,
    category: entry.category,
    direction: entry.direction,
    amount: entry.amount,
    description: entry.description,
    reference_id: entry.referenceId,
    occurred_at: entry.occurredAt,
    reversal_of_entry_external_id: entry.reversalOfEntryId ?? null,
    reversed_entry_external_id: entry.reversedEntryId ?? null,
    metadata: entry.metadata ?? {},
  };
}

export function rowToWallet(row: NegotiationWalletRow): NegotiationWallet {
  const createdAt = row.created_at || new Date().toISOString();

  return {
    id: row.external_id || row.id || crypto.randomUUID(),
    orderId: row.order_external_id || "",
    simulationId: row.simulation_external_id || "",
    orderNumber: row.order_number || "",
    client: row.client_name || "",
    createdAt,
    updatedAt: row.updated_at || createdAt,
    entries: (row.negotiation_wallet_entries ?? [])
      .map(rowToEntry)
      .sort((first, second) => second.occurredAt.localeCompare(first.occurredAt)),
  };
}

function rowToEntry(row: NegotiationWalletEntryRow): NegotiationWalletEntry {
  return {
    id: row.external_id || crypto.randomUUID(),
    orderId: row.order_external_id || "",
    sourceModule: normalizeSourceModule(row.source_module),
    category: normalizeCategory(row.category),
    direction: normalizeDirection(row.direction),
    amount: toNumber(row.amount),
    description: row.description || "",
    referenceId: row.reference_id || "",
    occurredAt: row.occurred_at || new Date().toISOString(),
    reversalOfEntryId: row.reversal_of_entry_external_id ?? undefined,
    reversedEntryId: row.reversed_entry_external_id ?? undefined,
    metadata: row.metadata ?? {},
  };
}
