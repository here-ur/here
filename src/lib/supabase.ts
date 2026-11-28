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

/** UT 전용 브랜치: 아이폰 사파리는 다른 사이트 안(iframe)의 쿠키를 분할 쿠키까지 모두 막는다.
 * 그래서 운영이 아닌 빌드가 iframe 안에서 열리면 로그인 쿠키를 이 사이트의 localStorage에 대신 둔다(저장이 막히면 탭 메모리). */
const UT_FRAME_COOKIE_KEY = "here-ut-frame-auth-cookies";
const frameCookieMemory: Record<string, string> = {};

function inThirdPartyFrame(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

function frameCookieJar(): Record<string, string> {
  try { return { ...JSON.parse(window.localStorage.getItem(UT_FRAME_COOKIE_KEY) ?? "{}"), ...frameCookieMemory }; } catch { return { ...frameCookieMemory }; }
}

const frameCookies = {
  getAll: () => Object.entries(frameCookieJar()).map(([name, value]) => ({ name, value })),
  setAll: (cookies: { name: string; value: string; options?: { maxAge?: number } }[]) => {
    const jar = frameCookieJar();
    for (const { name, value, options } of cookies) {
      if (!value || options?.maxAge === 0) { delete jar[name]; delete frameCookieMemory[name]; }
      else { jar[name] = value; frameCookieMemory[name] = value; }
    }
    try { window.localStorage.setItem(UT_FRAME_COOKIE_KEY, JSON.stringify(jar)); } catch { /* Memory fallback. */ }
  },
};

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
    ...(process.env.HERE_DEPLOY_ENV !== "production" && inThirdPartyFrame() ? { cookies: frameCookies } : {}),
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
