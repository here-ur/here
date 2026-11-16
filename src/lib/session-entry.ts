import type { SupabaseClient } from "@supabase/supabase-js";

type Identity = { id: string; phone?: string; email?: string; email_confirmed_at?: string; app_metadata?: { providers?: string[] } };
export type Entry = { kind: "login" } | { kind: "retry" } |
  { kind: "member"; id: string } | { kind: "signup"; phone: string } | { kind: "email-signup"; id: string; email: string };

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
    if (data === null && (user.email || user.app_metadata?.providers?.some(p => p === "google" || p === "kakao"))) {
      // DB가 auth.uid()와 검증된 Auth identity를 재확인한다. 사용자 metadata로 권한을 만들지 않는다.
      const registered = await client.rpc("register_verified_member").abortSignal(controller.signal);
      if (registered.error) return { kind: "retry" };
      if (registered.data === true) return { kind: "member", id: user.id };
      if (registered.data === false && user.email && user.email_confirmed_at) return { kind: "email-signup", id: user.id, email: user.email };
      return { kind: "retry" };
    }
    if (data === null && user.phone) return { kind: "signup", phone: user.phone };
    return { kind: "retry" };
  }
  try { return await Promise.race([check(), timeout]); }
  catch { return { kind: "retry" }; }
  finally { clearTimeout(timer); }
}

type StoreLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const RESET_PENDING_KEY = "here:password-reset-pending";

// 문자 인증으로 들어온 기존 회원이 새 비밀번호를 정하기 전까지 이 탭에만 남기는 표시.
// 다시 불러오거나 '다시 확인'을 눌러도 앱에 들어가지 않고 비밀번호 설정으로 돌아간다(권한이 아니라 화면 안내용).
export function resetStorage(): StoreLike | undefined {
  try { return typeof window === "undefined" ? undefined : window.sessionStorage; }
  catch { return undefined; }
}
export function markPasswordReset(store: StoreLike | undefined, userId: string) {
  try { if (userId) store?.setItem(RESET_PENDING_KEY, userId); } catch { /* 저장소를 못 쓰면 이 화면 안에서만 이어 간다. */ }
}
export function clearPasswordReset(store: StoreLike | undefined) {
  try { store?.removeItem(RESET_PENDING_KEY); } catch { /* 저장소를 못 쓰면 남은 표시도 없다. */ }
}
export function isPasswordResetPending(store: StoreLike | undefined, userId: string): boolean {
  if (!userId) return false;
  try { return store?.getItem(RESET_PENDING_KEY) === userId; }
  catch { return false; }
}

type AuthErrorLike = { name?: string; status?: number; code?: string; message?: string } | null | undefined;
// field: 문구가 가리키는 입력칸(연결·대기 문제면 없음). waitSeconds: 서버가 다시 보내기 전에 기다리라고 한 시간.
export type SmsFailure = { message: string; field?: "phone" | "code"; waitSeconds?: number };

// supabase-js는 연결 실패를 던지지 않고 error(AuthRetryableFetchError, status 0)로 돌려준다.
function isConnectionError(error: AuthErrorLike) {
  return error?.name === "AuthRetryableFetchError" || error?.status === 0;
}
function waitSeconds(error: AuthErrorLike) {
  const seconds = Number(error?.message?.match(/(\d+)\s*seconds?/)?.[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/** 인증번호 보내기·확인 실패를 사용자 문구로 바꾼다. 연결 문제는 입력한 번호를 탓하지 않는다. */
export function smsError(error: AuthErrorLike, phase: "send" | "verify"): SmsFailure {
  if (isConnectionError(error)) return { message: phase === "send"
    ? "인증번호를 보내지 못했어요. 연결을 확인하고 다시 시도해 주세요."
    : "인증을 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요." };
  if (error?.status === 429 || error?.code?.startsWith("over_")) {
    if (phase === "verify") return { message: "인증을 완료하지 못했어요. 잠시 후 다시 시도해 주세요." };
    const seconds = waitSeconds(error);
    return { message: seconds ? `인증번호는 ${seconds}초 후에 다시 받을 수 있어요.` : "인증번호는 잠시 후 다시 받을 수 있어요.", waitSeconds: seconds };
  }
  if (phase === "send") return { message: "인증번호를 보내지 못했어요. 번호를 확인하고 잠시 후 다시 시도해 주세요.", field: "phone" };
  if (error?.status && error.status >= 500) return { message: "인증을 완료하지 못했어요. 잠시 후 다시 시도해 주세요." };
  return { message: "인증번호가 맞지 않거나 만료됐어요. 다시 확인하거나 새로 받아 주세요.", field: "code" };
}

/** 이 탭이 보고 있는 계정과 공유 세션의 계정이 어긋났는지 보고, 회원 확인을 다시 할지 정한다.
 * 다른 탭의 로그인은 쿠키 세션을 바꾸므로, 이미 들어온 탭도 계정이 바뀌면 그 계정으로 다시 확인한다.
 * pendingUserId: 문자 인증 뒤 비밀번호를 정하는 중인 계정. idle: 시트가 닫혔거나 로그인 입력 단계라 따라가도 되는 상태. */
export function shouldRecheckAuth(event: string, sessionUserId: string | null | undefined, view: {
  userId: string | null; pendingUserId: string | null; idle: boolean; busy: boolean;
}): boolean {
  if (!["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "INITIAL_SESSION"].includes(event)) return false;
  if (view.userId) return Boolean(sessionUserId) && sessionUserId !== view.userId;
  if (view.busy) return false;
  if (view.pendingUserId) return Boolean(sessionUserId) && sessionUserId !== view.pendingUserId;
  return view.idle && Boolean(sessionUserId) && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED");
}
