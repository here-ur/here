import type { SupabaseClient } from "@supabase/supabase-js";

/** 탈퇴 유예기간(2026-11-26, 사용자 결정, 팀 확인 전). 이 안에 다시 로그인하면 탈퇴를 취소할 수 있다(0027).
 * 지나면 DB 작업이 로그인을 막고(finalize_withdrawals), 그 뒤 1년이 지나면 파기한다(임시 정책). */
export const WITHDRAWAL_GRACE_DAYS = 7;

/** 지금 로그인한 회원을 탈퇴시킨다. DB가 탈퇴 시각을 남기고 모든 기기의 세션을 지운다. 실패하면 던진다. */
export async function withdrawMember(client: SupabaseClient, signal?: AbortSignal): Promise<"ok" | "not_member"> {
  let call = client.rpc("withdraw_member");
  if (signal) call = call.abortSignal(signal);
  const { data, error } = await call;
  if (error) throw Error("withdraw_failed");
  if (data === "ok" || data === "not_member") return data;
  throw Error("withdraw_unknown");
}

export type CancelResult = "ok" | "expired" | "not_withdrawn" | "not_member";
/** 유예기간 안의 탈퇴를 취소한다. 실패하면 던진다. */
export async function cancelWithdrawal(client: SupabaseClient, signal?: AbortSignal): Promise<CancelResult> {
  let call = client.rpc("cancel_withdrawal");
  if (signal) call = call.abortSignal(signal);
  const { data, error } = await call;
  if (error) throw Error("cancel_failed");
  if (data === "ok" || data === "expired" || data === "not_withdrawn" || data === "not_member") return data;
  throw Error("cancel_unknown");
}

/** 탈퇴를 취소할 수 있는 마지막 때(탈퇴 시각 + 7일). 시각을 읽지 못하면 null. */
export function withdrawalDeadline(withdrawnAt: unknown): Date | null {
  if (typeof withdrawnAt !== "string") return null;
  const at = Date.parse(withdrawnAt);
  return Number.isFinite(at) ? new Date(at + WITHDRAWAL_GRACE_DAYS * 86_400_000) : null;
}

/** "11월 26일 오후 3시" (한국 시간). 취소할 수 있는 때를 사람이 읽기 쉽게 보여 준다. */
export function formatWithdrawalDeadline(deadline: Date): string {
  // 오전/오후 표기는 런타임마다 다르게 나와서(AM·PM) 한국 시간을 직접 계산한다(한국은 서머타임이 없다).
  const kst = new Date(deadline.getTime() + 9 * 3_600_000);
  const hour = kst.getUTCHours();
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}시`;
}

export const WITHDRAW_DONE_MESSAGE = `탈퇴를 신청했어요. ${WITHDRAWAL_GRACE_DAYS}일 안에 다시 로그인하면 취소할 수 있어요.`;
