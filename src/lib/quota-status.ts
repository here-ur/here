// 하루 남은 대화량. 서버 한도(api_quota_limits)의 하루 칸만 읽고, 사용량을 늘리지 않는다.
// 글은 보낸 메시지 수, 음성은 연결 횟수로 센다(음성 시간을 재지는 않는다).

export type QuotaCount = { limit: number; used: number };
export type QuotaStatus = { chat: QuotaCount; realtime: QuotaCount; resetAt: number };

const isCount = (value: unknown): value is QuotaCount => {
  if (!value || typeof value !== "object") return false;
  const { limit, used } = value as Record<string, unknown>;
  return Number.isSafeInteger(limit) && Number.isSafeInteger(used) && (limit as number) > 0 && (used as number) >= 0;
};

/** api_quota_status()의 응답을 확인한다. 모양이 다르면 null로 두고 화면에서 감춘다. */
export function parseQuotaStatus(data: unknown): QuotaStatus | null {
  if (!data || typeof data !== "object") return null;
  const { chat, realtime, reset_at } = data as Record<string, unknown>;
  if (!isCount(chat) || !isCount(realtime) || !Number.isSafeInteger(reset_at) || (reset_at as number) <= 0) return null;
  return { chat: { limit: chat.limit, used: chat.used }, realtime: { limit: realtime.limit, used: realtime.used }, resetAt: reset_at as number };
}

export type QuotaSummary = { chatLeft: number; voiceLeft: number; ratio: number; state: "ok" | "low" | "out" };

/** 메뉴에 표시하는 글 대화 횟수와 같은 기준으로 막대·부족 상태를 계산한다. */
export function quotaSummary(status: QuotaStatus): QuotaSummary {
  const left = (count: QuotaCount) => Math.max(0, count.limit - count.used);
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
