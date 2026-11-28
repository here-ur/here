import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { migrateAuthCookie } from "./auth-cookie-migration.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let browserClient: SupabaseClient | null = null;

/** UT 전용 브랜치: Useberry가 앱을 다른 사이트 안(iframe)에 띄우면 SameSite=Lax 쿠키가 저장되지 않아 로그인이 유지되지 않는다.
 * 운영이 아닌 https 빌드에서는 iframe 안에서도 쓰이는 분할(Partitioned) 쿠키로 저장한다. 운영 빌드는 그대로 Lax다. */
export function authCookieOptions(https: boolean) {
  if (https && process.env.HERE_DEPLOY_ENV !== "production") {
    return { path: "/", sameSite: "none" as const, secure: true, partitioned: true };
  }
  return { path: "/", sameSite: "lax" as const, secure: https };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && key);
}

export function browserSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  if (typeof window === "undefined") return null;
  if (!browserClient) {
    try { migrateAuthCookie(url, document, window.localStorage, location.protocol === "https:"); } catch { /* Storage may be blocked. */ }
  }
  browserClient ??= createBrowserClient(url, key, {
    cookieOptions: authCookieOptions(location.protocol === "https:"),
    auth: { detectSessionInUrl: false },
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
