import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NegotiationWallet,
  NegotiationWalletEntry,
  OpportunityPool,
  OpportunityPoolEntry,
} from "@/data/types";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";

type WalletRow = {
  id: string;
  external_id: string | null;
  organization_id: string;
  negotiation_id: string | null;
  simulation_external_id: string | null;
  order_external_id: string | null;
  initial_expected_profit: number | string;
  current_balance: number | string;
  final_balance: number | string | null;
  status: NegotiationWallet["status"];
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  negotiation_wallet_entries?: WalletEntryRow[];
};

type WalletEntryRow = {
  id: string;
  external_id: string | null;
  wallet_external_id: string | null;
  organization_id: string;
  negotiation_id: string | null;
  simulation_external_id: string | null;
  order_external_id: string | null;
  entry_type: NegotiationWalletEntry["entryType"];
  category: NegotiationWalletEntry["category"];
  source_module: NegotiationWalletEntry["sourceModule"];
  amount: number | string;
  direction: NegotiationWalletEntry["direction"];
  description: string;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
  created_by_text: string | null;
  created_at: string;
  reversed_at: string | null;
  reversed_by_text: string | null;
  reversal_reason: string | null;
};

type PoolRow = {
  id: string;
  external_id: string | null;
  organization_id: string;
  name: string;
  description: string | null;
  balance: number | string;
  status: OpportunityPool["status"];
  created_at: string;
  updated_at: string;
  opportunity_pool_entries?: PoolEntryRow[];
};

type PoolEntryRow = {
  id: string;
  external_id: string | null;
  pool_external_id: string | null;
  wallet_external_id: string | null;
  organization_id: string;
  amount: number | string;
  direction: OpportunityPoolEntry["direction"];
  description: string;
  created_by_text: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const WALLET_SELECT = `
  *,
  negotiation_wallet_entries(*)
`;

const POOL_SELECT = `
  *,
  opportunity_pool_entries(*)
`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

function isDatabaseUuid(value?: string | null) {
  return Boolean(value && UUID_PATTERN.test(value));
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function walletRowToDomain(row: WalletRow): NegotiationWallet {
  return {
    id: row.external_id ?? row.id,
    organizationId: row.organization_id,
    negotiationId: row.negotiation_id ?? undefined,
    simulationId: row.simulation_external_id ?? undefined,
    orderId: row.order_external_id ?? "",
    initialExpectedProfit: numberValue(row.initial_expected_profit),
    currentBalance: numberValue(row.current_balance),
    finalBalance: row.final_balance == null ? undefined : numberValue(row.final_balance),
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entries: (row.negotiation_wallet_entries ?? [])
      .map(walletEntryRowToDomain)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
  };
}

function walletEntryRowToDomain(row: WalletEntryRow): NegotiationWalletEntry {
  return {
    id: row.external_id ?? row.id,
    walletId: row.wallet_external_id ?? "",
    organizationId: row.organization_id,
    negotiationId: row.negotiation_id ?? undefined,
    simulationId: row.simulation_external_id ?? undefined,
    orderId: row.order_external_id ?? "",
    entryType: row.entry_type,
    category: row.category,
    sourceModule: row.source_module,
    amount: numberValue(row.amount),
    direction: row.direction,
    description: row.description,
    referenceId: row.reference_id ?? undefined,
    metadata: row.metadata ?? {},
    createdBy: row.created_by_text ?? undefined,
    createdAt: row.created_at,
    reversedAt: row.reversed_at ?? undefined,
    reversedBy: row.reversed_by_text ?? undefined,
    reversalReason: row.reversal_reason ?? undefined,
  };
}

function poolRowToDomain(row: PoolRow): OpportunityPool {
  return {
    id: row.external_id ?? row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description ?? undefined,
    balance: numberValue(row.balance),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entries: (row.opportunity_pool_entries ?? [])
      .map(poolEntryRowToDomain)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt)),
  };
}

function poolEntryRowToDomain(row: PoolEntryRow): OpportunityPoolEntry {
  return {
    id: row.external_id ?? row.id,
    poolId: row.pool_external_id ?? "",
    walletId: row.wallet_external_id ?? undefined,
    organizationId: row.organization_id,
    amount: numberValue(row.amount),
    direction: row.direction,
    description: row.description,
    createdBy: row.created_by_text ?? undefined,
    createdAt: row.created_at,
    metadata: row.metadata ?? {},
  };
}

function walletToRow(wallet: NegotiationWallet) {
  return {
    external_id: wallet.id,
    organization_id: wallet.organizationId,
    negotiation_id: wallet.negotiationId ?? null,
    simulation_external_id: wallet.simulationId ?? null,
    order_external_id: wallet.orderId || null,
    initial_expected_profit: wallet.initialExpectedProfit,
    current_balance: wallet.currentBalance,
    final_balance: wallet.finalBalance ?? null,
    status: wallet.status,
    opened_at: wallet.openedAt,
    closed_at: wallet.closedAt ?? null,
    created_at: wallet.createdAt,
    updated_at: wallet.updatedAt,
  };
}

function walletEntryToRow(entry: NegotiationWalletEntry, walletUuid: string) {
  return {
    external_id: entry.id,
    wallet_id: walletUuid,
    wallet_external_id: entry.walletId,
    organization_id: entry.organizationId,
    negotiation_id: entry.negotiationId ?? null,
    simulation_external_id: entry.simulationId ?? null,
    order_external_id: entry.orderId || null,
    entry_type: entry.entryType,
    category: entry.category,
    source_module: entry.sourceModule,
    amount: entry.amount,
    direction: entry.direction,
    description: entry.description,
    reference_id: entry.referenceId ?? null,
    metadata: entry.metadata ?? {},
    created_by_text: entry.createdBy ?? null,
    created_at: entry.createdAt,
    reversed_at: entry.reversedAt ?? null,
    reversed_by_text: entry.reversedBy ?? null,
    reversal_reason: entry.reversalReason ?? null,
  };
}

function poolToRow(pool: OpportunityPool) {
  return {
    external_id: pool.id,
    organization_id: pool.organizationId,
    name: pool.name,
    description: pool.description ?? null,
    balance: pool.balance,
    status: pool.status,
    created_at: pool.createdAt,
    updated_at: pool.updatedAt,
  };
}

function poolEntryToRow(entry: OpportunityPoolEntry, poolUuid: string) {
  return {
    external_id: entry.id,
    pool_id: poolUuid,
    pool_external_id: entry.poolId,
    wallet_external_id: entry.walletId ?? null,
    organization_id: entry.organizationId,
    amount: entry.amount,
    direction: entry.direction,
    description: entry.description,
    created_by_text: entry.createdBy ?? null,
    created_at: entry.createdAt,
    metadata: entry.metadata ?? {},
  };
}

async function replaceWalletEntries(
  client: SupabaseClient,
  walletUuid: string,
  entries: NegotiationWalletEntry[],
) {
  const deleteResult = await client
    .from("negotiation_wallet_entries")
    .delete()
    .eq("wallet_id", walletUuid);
  if (deleteResult.error) throw deleteResult.error;
  if (entries.length === 0) return;

  const insertResult = await client
    .from("negotiation_wallet_entries")
    .insert(entries.map((entry) => walletEntryToRow(entry, walletUuid)));
  if (insertResult.error) throw insertResult.error;
}

async function replacePoolEntries(
  client: SupabaseClient,
  poolUuid: string,
  entries: OpportunityPoolEntry[],
) {
  const deleteResult = await client
    .from("opportunity_pool_entries")
    .delete()
    .eq("pool_id", poolUuid);
  if (deleteResult.error) throw deleteResult.error;
  if (entries.length === 0) return;

  const insertResult = await client
    .from("opportunity_pool_entries")
    .insert(entries.map((entry) => poolEntryToRow(entry, poolUuid)));
  if (insertResult.error) throw insertResult.error;
}

function isMissingOnConflictConstraint(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "42P10";
}

async function saveRowByExternalId(
  client: SupabaseClient,
  table: "negotiation_wallets" | "opportunity_pools",
  row: Record<string, unknown>,
  externalId: string,
  label: string,
) {
  const upsertResult = await client
    .from(table)
    .upsert(row, { onConflict: "external_id" })
    .select("id")
    .single();

  if (!upsertResult.error) return upsertResult.data;
  if (!isMissingOnConflictConstraint(upsertResult.error)) throw upsertResult.error;

  console.warn(
    `${label} sem constraint de conflito no Supabase; usando update/insert manual.`,
    upsertResult.error,
  );

  const existingResult = await client
    .from(table)
    .select("id")
    .eq("external_id", externalId)
    .limit(1)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;

  if (existingResult.data?.id) {
    const updateResult = await client
      .from(table)
      .update(row)
      .eq("id", existingResult.data.id)
      .select("id")
      .single();
    if (updateResult.error) throw updateResult.error;
    return updateResult.data;
  }

  const insertResult = await client.from(table).insert(row).select("id").single();
  if (insertResult.error) throw insertResult.error;
  return insertResult.data;
}

async function resolveOrganizationId(client: SupabaseClient, preferredOrganizationId: string) {
  if (isDatabaseUuid(preferredOrganizationId)) return preferredOrganizationId;

  const { data: authData } = await client.auth.getUser();
  const userId = authData.user?.id;
  if (userId) {
    const membershipResult = await client
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const organizationId = membershipResult.data?.organization_id;
    if (!membershipResult.error && isDatabaseUuid(organizationId)) return organizationId as string;
  }

  const organizationResult = await client.from("organizations").select("id").limit(1).maybeSingle();
  const organizationId = organizationResult.data?.id;
  if (!organizationResult.error && isDatabaseUuid(organizationId)) return organizationId as string;

  throw new Error("Não foi possível identificar a organização para salvar a carteira.");
}

export function createSupabaseNegotiationWalletRepository() {
  return {
    async listWallets() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("negotiation_wallets")
        .select(WALLET_SELECT)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as WalletRow[]).map(walletRowToDomain);
    },

    async saveWallet(wallet: NegotiationWallet) {
      await ensureSupabaseSession();
      const client = requireClient();
      const organizationId = await resolveOrganizationId(client, wallet.organizationId);
      const normalizedWallet: NegotiationWallet = {
        ...wallet,
        organizationId,
        entries: wallet.entries.map((entry) => ({ ...entry, organizationId })),
      };
      const data = await saveRowByExternalId(
        client,
        "negotiation_wallets",
        walletToRow(normalizedWallet),
        normalizedWallet.id,
        "Carteira",
      );

      if (!data?.id) throw new Error("Carteira não retornou identificador no Supabase.");

      await replaceWalletEntries(client, data.id as string, normalizedWallet.entries);
      return normalizedWallet;
    },

    async listPools() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("opportunity_pools")
        .select(POOL_SELECT)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as PoolRow[]).map(poolRowToDomain);
    },

    async savePool(pool: OpportunityPool) {
      await ensureSupabaseSession();
      const client = requireClient();
      const organizationId = await resolveOrganizationId(client, pool.organizationId);
      const normalizedPool: OpportunityPool = {
        ...pool,
        organizationId,
        entries: pool.entries.map((entry) => ({ ...entry, organizationId })),
      };
      const data = await saveRowByExternalId(
        client,
        "opportunity_pools",
        poolToRow(normalizedPool),
        normalizedPool.id,
        "Pool de oportunidades",
      );

      if (!data?.id) throw new Error("Pool não retornou identificador no Supabase.");

      await replacePoolEntries(client, data.id as string, normalizedPool.entries);
      return normalizedPool;
    },
  };
}
