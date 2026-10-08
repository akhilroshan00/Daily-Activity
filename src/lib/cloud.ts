import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authFetchWithTimeout } from "./auth-fetch";
let client: SupabaseClient | null = null;
export function cloudClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (!client)
    client = createClient(url, key, {
      global: {
        fetch: authFetchWithTimeout((input, init) => fetch(input, init)),
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  return client;
}
