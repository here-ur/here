import type { SupabaseClient } from "@supabase/supabase-js";

export type OAuthCompletion = "success" | "cancelled" | "withdrawn" | "failed";

/** PKCE code 교환은 같은 콜백에서 한 번만. 공급자의 오류 설명은 화면에 그대로 출력하지 않는다. */
export function createOAuthCompletion(client: SupabaseClient | null, timeoutMs = 15000) {
  let current: { url: string; promise: Promise<OAuthCompletion> } | undefined;
  return function complete(input: string): Promise<OAuthCompletion> {
    if (current?.url === input) return current.promise;
    const url = new URL(input);
    const params = url.searchParams;
    // 탈퇴한 계정은 Auth가 오류 코드(user_banned)와 함께 돌려보낸다. 취소로 보이지 않게 먼저 본다.
    if (params.get("error_code") === "user_banned") return Promise.resolve("withdrawn");
    if (params.get("error") === "access_denied") return Promise.resolve("cancelled");
    const code = params.get("code");
    if (!client || !code || params.getAll("code").length !== 1 || params.has("error")) return Promise.resolve("failed");
    const flowId = params.get("flow_id");
    const promise = (async (): Promise<OAuthCompletion> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          client.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
            .then(({ data, error }): OAuthCompletion => !error && data.session ? "success" : error?.code === "user_banned" ? "withdrawn" : "failed"),
          new Promise<OAuthCompletion>(resolve => { timer = setTimeout(() => resolve("failed"), timeoutMs); }),
        ]);
      } catch { return "failed"; }
      finally { clearTimeout(timer); }
    })();
    current = { url: input, promise };
    return promise;
  };
}
