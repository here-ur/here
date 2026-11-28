// 글은 한국 날짜별 정상 답변 + 진행 중 예약을 반영한다. 조회는 차감하지 않는다.
// 음성 시간 계약은 별도 마이그레이션에서 교체 예정.

export type QuotaCount = { limit: number; used: number; reserved?: number };
export type QuotaStatus = { chat: QuotaCount; realtime: QuotaCount; resetAt: number };

const isCount = (value: unknown): value is QuotaCount => {
  if (!value || typeof value !== "object") return false;
  const { limit, used, reserved } = value as Record<string, unknown>;
  return Number.isSafeInteger(limit) && Number.isSafeInteger(used) && (limit as number) > 0 && (used as number) >= 0
    && (reserved === undefined || (Number.isSafeInteger(reserved) && (reserved as number) >= 0));
};

/** api_quota_status()의 응답을 확인한다. 모양이 다르면 null로 두고 화면에서 감춘다. */
export function parseQuotaStatus(data: unknown): QuotaStatus | null {
  if (!data || typeof data !== "object") return null;
  const { chat, realtime, reset_at } = data as Record<string, unknown>;
  if (!isCount(chat) || !isCount(realtime) || !Number.isSafeInteger(reset_at) || (reset_at as number) <= 0) return null;
  return { chat: { limit: chat.limit, used: chat.used, ...(chat.reserved === undefined ? {} : { reserved: chat.reserved }) }, realtime: { limit: realtime.limit, used: realtime.used }, resetAt: reset_at as number };
}

export type QuotaSummary = { chatLeft: number; voiceLeft: number; ratio: number; state: "ok" | "low" | "out" };

/** 메뉴에 표시하는 글 대화 횟수와 같은 기준으로 막대·부족 상태를 계산한다. */
export function quotaSummary(status: QuotaStatus): QuotaSummary {
  const left = (count: QuotaCount) => Math.max(0, count.limit - count.used - (count.reserved ?? 0));
  const chatLeft = left(status.chat);
  const voiceLeft = left(status.realtime);
  const ratio = chatLeft / status.chat.limit;
  const state = chatLeft === 0 ? "out" : ratio < 0.2 ? "low" : "ok";
  return { chatLeft, voiceLeft, ratio, state };
}

export async function requestQuotaStatus(token: string, signal?: AbortSignal): Promise<QuotaStatus | null> {
  const response = await fetch("/api/quota", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
  if (!response.ok) return null;
  return parseQuotaStatus(await response.json());
}
