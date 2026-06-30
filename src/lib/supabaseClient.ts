import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseProvider } from "@/lib/dataProvider";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let missingConfigLogged = false;
let client: SupabaseClient | null = null;

export function getSupabaseConfigStatus() {
  return {
    configured: Boolean(supabaseUrl && supabaseAnonKey),
    missing: {
      url: !supabaseUrl,
      anonKey: !supabaseAnonKey,
    },
  };
}

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    if (isSupabaseProvider() && !missingConfigLogged) {
      console.error(
        "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local or keep VITE_DATA_PROVIDER=local.",
      );
      missingConfigLogged = true;
    }
    return null;
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return client;
}

export async function ensureSupabaseSession() {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  if (data.session) return data.session;

  throw new Error("Sessão Supabase ausente. Faça login novamente.");
}
