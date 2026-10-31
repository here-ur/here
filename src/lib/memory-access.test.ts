import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { requireMemoryConsent } from "./memory-access.ts";

test("동의 확인은 승인된 회원만 통과시키고 실패 시 닫힌 상태를 유지한다", async () => {
  const names = ["MEMORY_ENABLED", "NEXT_PUBLIC_SUPABASE_URL", "VERCEL_ENV"] as const;
  const saved = names.map(name => process.env[name]);
  let calls = 0;
  const client = (data: unknown, error: unknown = null, throws = false) => ({ rpc(name: string) {
    calls++; assert.equal(name, "memory_is_enabled");
    return { async abortSignal(signal: AbortSignal) {
      assert.equal(signal.aborted, false);
      if (throws) throw new Error("private_database_detail");
      return { data, error };
    } };
  } }) as unknown as SupabaseClient;
  try {
    process.env.MEMORY_ENABLED = "true";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mwjwfumpxdlllikcdvkh.supabase.co";
    process.env.VERCEL_ENV = "preview";
    assert.equal(await requireMemoryConsent(client(true)), null);
    for (const data of [false, null, "true"]) {
      const result = await requireMemoryConsent(client(data));
      assert.equal(result?.status, 403);
      assert.equal((await result?.json()).code, "consent_required");
      assert.equal(result?.headers.get("cache-control"), "no-store");
    }
    for (const stub of [client(true, { message: "private_database_detail" }), client(null, null, true)]) {
      const result = await requireMemoryConsent(stub);
      assert.equal(result?.status, 503);
      assert.ok(!(await result!.text()).includes("private_database_detail"));
    }
    const before = calls;
    process.env.VERCEL_ENV = "production";
    assert.equal(await requireMemoryConsent(client(false)), null);
    assert.equal(calls, before); // Production is unchanged while the pilot is disabled.
  } finally {
    names.forEach((name, i) => {
      if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i];
    });
  }
});

test("경로 구성 검사: 텍스트·음성 모두 모델 호출보다 먼저 회원·동의 검사를 둔다", () => {
  for (const route of ["chat", "realtime"]) {
    const source = readFileSync(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /await requireMember\((?:request|req)\)/);
    assert.ok(source.includes("await requireMemoryConsent(access.supabase)"));
    assert.ok(source.includes("if (consentError) return consentError"));
    const provider = route === "chat" ? "return chatResponse(request" : "await openai(";
    assert.ok(source.indexOf(provider) >= 0);
    assert.ok(source.indexOf("if (consentError)") < source.indexOf(provider));
  }
});
