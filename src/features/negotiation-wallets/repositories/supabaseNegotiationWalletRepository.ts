import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";
import type { NegotiationWallet } from "@/data/types";
import {
  entryToRow,
  rowToWallet,
  walletToRow,
  type NegotiationWalletRepository,
  type NegotiationWalletRow,
} from "@/features/negotiation-wallets/repositories/negotiationWalletRepository";

const WALLET_SELECT = `
  *,
  negotiation_wallet_entries(*)
`;

type WalletForeignKeys = {
  organizationId?: string | null;
  unitId?: string | null;
  orderUuid?: string | null;
};

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

async function resolveWalletForeignKeys(
  client: SupabaseClient,
  wallet: NegotiationWallet,
): Promise<WalletForeignKeys> {
  const [{ data: orders }, { data: units }] = await Promise.all([
    client
      .from("orders")
      .select("id, organization_id, unit_id")
      .eq("external_id", wallet.orderId)
      .limit(1),
    client.from("units").select("id, organization_id").limit(1),
  ]);

  const order = orders?.[0] as
    { id?: string | null; organization_id?: string | null; unit_id?: string | null } | undefined;
  const unit = units?.[0] as { id?: string | null; organization_id?: string | null } | undefined;

  return {
    organizationId: order?.organization_id ?? unit?.organization_id ?? null,
    unitId: order?.unit_id ?? unit?.id ?? null,
    orderUuid: order?.id ?? null,
  };
}

async function fetchWalletInternal(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from("negotiation_wallets")
    .select(WALLET_SELECT)
    .eq("external_id", id)
    .maybeSingle();

  if (error) throw error;
  return data as NegotiationWalletRow | null;
}

export function createSupabaseNegotiationWalletRepository(): NegotiationWalletRepository {
  return {
    async list() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client
        .from("negotiation_wallets")
        .select(WALLET_SELECT)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return ((data ?? []) as NegotiationWalletRow[]).map(rowToWallet);
    },

    async save(wallet) {
      await ensureSupabaseSession();
      const client = requireClient();
      const keys = await resolveWalletForeignKeys(client, wallet);
      const { data, error } = await client
        .from("negotiation_wallets")
        .upsert(walletToRow(wallet, keys), { onConflict: "external_id" })
        .select("id")
        .single();

      if (error) throw error;
      const walletUuid = data.id as string;

      const deleteResult = await client
        .from("negotiation_wallet_entries")
        .delete()
        .eq("wallet_id", walletUuid);
      if (deleteResult.error) throw deleteResult.error;

      if (wallet.entries.length > 0) {
        const insertResult = await client
          .from("negotiation_wallet_entries")
          .insert(wallet.entries.map((entry) => entryToRow(entry, walletUuid)));
        if (insertResult.error) throw insertResult.error;
      }

      const saved = await fetchWalletInternal(client, wallet.id);
      return saved ? rowToWallet(saved) : wallet;
    },
  };
}
