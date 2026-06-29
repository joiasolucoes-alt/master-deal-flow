import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
    if (!missingConfigLogged) {
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
      },
    });
  }

  return client;
}

export const supabase = getSupabaseClient();

export async function ensureSupabaseSession() {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  if (data.session) return data.session;

  const result = await client.auth.signInAnonymously();
  if (result.error) {
    console.error(
      "Supabase session could not be started. Enable anonymous sign-ins or configure Supabase Auth before using VITE_DATA_PROVIDER=supabase.",
      result.error,
    );
    throw result.error;
  }

  return result.data.session;
}
