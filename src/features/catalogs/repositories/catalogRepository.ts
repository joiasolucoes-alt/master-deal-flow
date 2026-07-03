import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, Product, Supplier } from "@/data/types";
import { ensureSupabaseSession, getSupabaseClient } from "@/lib/supabaseClient";

type ClientRow = {
  external_id?: string | null;
  code?: string | null;
  name: string;
  document?: string | null;
  city?: string | null;
  state?: string | null;
  active?: boolean | null;
};

type SupplierRow = ClientRow;

type ProductRow = {
  external_id?: string | null;
  code?: string | null;
  name?: string | null;
  description?: string | null;
  brand?: string | null;
  category?: string | null;
  unit_label?: string | null;
  units_per_box?: number | null;
  default_unit_cost?: number | null;
  default_sale_unit?: number | null;
  active?: boolean | null;
};

function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase não está configurado.");
  return client;
}

function externalId(prefix: string, value: string) {
  return value.startsWith(`${prefix}-`) ? value : `${prefix}-${value}`;
}

function rowToClient(row: ClientRow): Client {
  return {
    id: row.external_id || `cli-${row.name}`,
    code: row.code ?? undefined,
    name: row.name,
    document: row.document ?? undefined,
    city: row.city || "",
    state: row.state || "",
    unit: "Matriz Cataguases",
    active: row.active ?? true,
  };
}

function clientToRow(client: Client): Record<string, unknown> {
  return {
    external_id: externalId("cli", client.id),
    code: client.code ?? null,
    name: client.name,
    document: client.document ?? null,
    city: client.city || null,
    state: client.state || null,
    active: client.active ?? true,
  };
}

function rowToSupplier(row: SupplierRow): Supplier {
  return {
    id: row.external_id || `sup-${row.name}`,
    code: row.code ?? undefined,
    name: row.name,
    document: row.document ?? undefined,
    city: row.city || "",
    state: row.state || "",
    active: row.active ?? true,
  };
}

function supplierToRow(supplier: Supplier): Record<string, unknown> {
  return {
    external_id: externalId("sup", supplier.id),
    code: supplier.code ?? null,
    name: supplier.name,
    document: supplier.document ?? null,
    city: supplier.city || null,
    state: supplier.state || null,
    active: supplier.active ?? true,
  };
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.external_id || `prod-${row.code ?? row.name ?? row.description}`,
    code: row.code || "",
    name: row.name || row.description || "",
    brand: row.brand ?? undefined,
    category: row.category ?? undefined,
    unitLabel: row.unit_label || "UN",
    defaultUnitsPerBox: Number(row.units_per_box ?? 1),
    costUnit: Number(row.default_unit_cost ?? 0),
    saleUnit: Number(row.default_sale_unit ?? 0),
    active: row.active ?? true,
  };
}

function productToRow(product: Product): Record<string, unknown> {
  return {
    external_id: externalId("prod", product.id),
    code: product.code,
    name: product.name,
    description: product.name,
    brand: product.brand ?? null,
    category: product.category ?? null,
    unit_label: product.unitLabel,
    units_per_box: product.defaultUnitsPerBox,
    default_unit_cost: product.costUnit,
    default_sale_unit: product.saleUnit,
    active: product.active ?? true,
  };
}

export function createSupabaseCatalogRepository() {
  return {
    async listClients() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client.from("clients").select("*").order("name");
      if (error) throw error;
      return ((data ?? []) as ClientRow[]).map(rowToClient);
    },

    async saveClient(value: Client) {
      await ensureSupabaseSession();
      const client = requireClient();
      const row = clientToRow(value);
      const { data, error } = await client
        .from("clients")
        .upsert(row, { onConflict: "external_id" })
        .select("*")
        .single();
      if (error) throw error;
      return rowToClient(data as ClientRow);
    },

    async listSuppliers() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client.from("suppliers").select("*").order("name");
      if (error) throw error;
      return ((data ?? []) as SupplierRow[]).map(rowToSupplier);
    },

    async saveSupplier(value: Supplier) {
      await ensureSupabaseSession();
      const client = requireClient();
      const row = supplierToRow(value);
      const { data, error } = await client
        .from("suppliers")
        .upsert(row, { onConflict: "external_id" })
        .select("*")
        .single();
      if (error) throw error;
      return rowToSupplier(data as SupplierRow);
    },

    async listProducts() {
      await ensureSupabaseSession();
      const client = requireClient();
      const { data, error } = await client.from("products").select("*").order("description");
      if (error) throw error;
      return ((data ?? []) as ProductRow[]).map(rowToProduct);
    },

    async saveProduct(value: Product) {
      await ensureSupabaseSession();
      const client = requireClient();
      const row = productToRow(value);
      const { data, error } = await client
        .from("products")
        .upsert(row, { onConflict: "external_id" })
        .select("*")
        .single();
      if (error) throw error;
      return rowToProduct(data as ProductRow);
    },
  };
}
