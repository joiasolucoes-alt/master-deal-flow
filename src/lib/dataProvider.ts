export type DataProvider = "local" | "supabase";

const VALID_DATA_PROVIDERS = new Set<DataProvider>(["local", "supabase"]);

export function getDataProvider(envValue = import.meta.env.VITE_DATA_PROVIDER): DataProvider {
  if (VALID_DATA_PROVIDERS.has(envValue as DataProvider)) return envValue as DataProvider;
  return "local";
}

export function isSupabaseProvider() {
  return getDataProvider() === "supabase";
}
