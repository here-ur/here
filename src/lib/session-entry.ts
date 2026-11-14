import type { SupabaseClient } from "@supabase/supabase-js";

type Identity = { id: string; phone?: string };
export type Entry = { kind: "login" } | { kind: "retry" } |
  { kind: "member"; id: string } | { kind: "signup"; phone: string };

// getUser restores/refreshes the SDK session and verifies its identity.
// A timeout or failed lookup cannot establish that a session or membership is missing.
export async function checkEntry(client: SupabaseClient, verified?: Identity, timeoutMs = 10000): Promise<Entry> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Entry>(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve({ kind: "retry" }); }, timeoutMs);
  });
  async function check(): Promise<Entry> {
    let user = verified;
    if (!user) {
      let { data, error } = await client.auth.getUser();
      // Access-token expiry alone must not send a returning member to SMS.
      const terminal = (e: typeof error) => e?.name === "AuthSessionMissingError" ||
        ["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "user_not_found"].includes(e?.code ?? "");
      if (error && !terminal(error) && (error.status === 401 || error.code === "bad_jwt")) {
        const refreshed = await client.auth.refreshSession();
        if (controller.signal.aborted) return { kind: "retry" };
        if (refreshed.error) return { kind: terminal(refreshed.error) ? "login" : "retry" };
        ({ data, error } = await client.auth.getUser());
        if (error && !terminal(error)) return { kind: "retry" };
      }
      if (error) {
        const expired = terminal(error);
        return { kind: expired ? "login" : "retry" };
      }
      if (!data.user) return { kind: "login" };
      user = data.user;
    }
    if (controller.signal.aborted) return { kind: "retry" };
    const { data, error } = await client.from("members").select("user_id").eq("user_id", user.id)
      .abortSignal(controller.signal).maybeSingle();
    if (error) return { kind: "retry" };
    if (data?.user_id === user.id) return { kind: "member", id: user.id };
    if (data === null && user.phone) return { kind: "signup", phone: user.phone };
    return { kind: "retry" };
  }
  try { return await Promise.race([check(), timeout]); }
  catch { return { kind: "retry" }; }
  finally { clearTimeout(timer); }
}
