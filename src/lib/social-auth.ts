import type { SupabaseClient } from "@supabase/supabase-js";

export type SocialProvider = "kakao" | "google";
export const providerName = { kakao: "카카오", google: "구글" } as const;

export function normalizeEmail(value: string): string | null {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

type AuthFailure = { code?: string; status?: number } | null;

/** 탈퇴하면 Auth가 계정을 막는다(user_banned). 파기 전 1년 동안은 같은 계정으로 다시 들어오거나 가입할 수 없다. */
export const WITHDRAWN_MESSAGE = "탈퇴한 계정이에요. 탈퇴하고 1년 동안은 같은 계정으로 다시 로그인하거나 가입할 수 없어요.";
export function isWithdrawnAuthError(error: AuthFailure | undefined): boolean {
  return error?.code === "user_banned";
}
export function emailAuthError(error: AuthFailure, phase: "send" | "verify"): string {
  if (isWithdrawnAuthError(error)) return WITHDRAWN_MESSAGE;
  if (error?.status === 429 || error?.code?.startsWith("over_")) return "요청이 많아요. 잠시 후 다시 시도해 주세요.";
  if (error?.code === "email_address_not_authorized" || error?.code === "email_provider_disabled") {
    return "이메일 인증을 준비 중이에요. 잠시 후 다시 시도해 주세요.";
  }
  if (phase === "verify" && ["otp_expired", "otp_disabled"].includes(error?.code ?? "")) {
    return "인증번호가 맞지 않거나 만료됐어요. 다시 확인하거나 새로 받아 주세요.";
  }
  return phase === "send" ? "인증번호를 보내지 못했어요. 이메일 주소와 연결 상태를 확인해 주세요."
    : "인증을 완료하지 못했어요. 인증번호와 연결 상태를 확인해 주세요.";
}

// /authorize는 미설정 공급자도 URL을 돌려주므로, 공개 설정을 먼저 확인한다.
// 서비스 키나 공급자 secret은 브라우저에서 사용하지 않는다.
export async function socialSignInUrl(client: SupabaseClient, provider: SocialProvider, origin: string,
  config: { url: string; key: string }, fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(`${config.url}/auth/v1/settings`, {
    headers: { apikey: config.key }, signal: AbortSignal.timeout(8000), cache: "no-store",
  });
  if (!response.ok) throw new Error("로그인 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
  const settings = await response.json();
  if (settings.external?.[provider] !== true) throw new Error(`${providerName[provider]} 로그인을 준비 중이에요. 다른 로그인 방법을 이용해 주세요.`);
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: new URL("/auth/callback", origin).toString(), skipBrowserRedirect: true,
      // Kakao's default Supabase scopes include account_email, unavailable on this app.
      // Override that default; `scopes` alone only appends to it.
      ...(provider === "kakao" ? { queryParams: { scope: "profile_nickname profile_image" } } : {}),
    },
  });
  if (error || !data.url) throw new Error(`${providerName[provider]} 로그인에 연결하지 못했어요. 다시 시도해 주세요.`);
  return data.url;
}
