import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { devCanonicalAddress } from "./lib/dev-canonical-address";

// Refresh the same first-party session before the app boots after a long absence.
// APIs still require a verified Bearer token and membership; cookies grant no access by themselves.
export async function proxy(request: NextRequest) {
  const canonical = devCanonicalAddress(request.url, request.method, {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
  });
  if (canonical) return NextResponse.redirect(canonical, { status: 307, headers: { "Cache-Control": "private, no-store" } });
  const response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookieOptions: { path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:" },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(5000) }) },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, headers) => {
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });
  try { await client.auth.getUser(); } catch { /* The client retries transient failures without a login redirect. */ }
  return response;
}

export const config = { matcher: ["/"] };
