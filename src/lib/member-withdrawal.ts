import type { SupabaseClient } from "@supabase/supabase-js";

/** 지금 로그인한 회원을 탈퇴시킨다. DB가 탈퇴 시각을 남기고, 로그인을 막고, 모든 기기의 세션을 지운다(0025).
 * 서버 데이터는 1년 보관 뒤 파기한다(임시 정책). 실패하면 던진다. */
export async function withdrawMember(client: SupabaseClient, signal?: AbortSignal): Promise<"ok" | "not_member"> {
  let call = client.rpc("withdraw_member");
  if (signal) call = call.abortSignal(signal);
  const { data, error } = await call;
  if (error) throw Error("withdraw_failed");
  if (data === "ok" || data === "not_member") return data;
  throw Error("withdraw_unknown");
}

export const WITHDRAW_DONE_MESSAGE = "탈퇴를 마쳤어요. 그동안 함께해 줘서 고마워요.";
