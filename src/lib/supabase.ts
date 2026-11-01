import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && key);
}

export function browserSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  browserClient ??= createClient(url, key, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  return browserClient;
}

export function requestSupabase(token: string): SupabaseClient | null {
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, {
      ...init, cache: "no-store",
      // Per request, not per client lifetime: background memory work keeps its own deadline.
      signal: AbortSignal.any([AbortSignal.timeout(5000), ...(init?.signal ? [init.signal] : [])]),
    }) },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
