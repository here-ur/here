// 글은 한국 날짜별 정상 답변 + 진행 중 예약을 반영한다. 조회는 차감하지 않는다.
// 음성은 DB가 관측한 연결 시간(초)을 사용한다.

export type QuotaCount = { limit: number; used: number; reserved?: number };
export type VoiceUsage = { call_limit_seconds: number; active_call: boolean; day: { limit_seconds: number; used_seconds: number; reset_at: number }; month: { limit_seconds: number; used_seconds: number; reset_at: number } };
export type QuotaStatus = { chat: QuotaCount; realtime: QuotaCount; resetAt: number; voice?: VoiceUsage };

const isCount = (value: unknown): value is QuotaCount => {
  if (!value || typeof value !== "object") return false;
  const { limit, used, reserved } = value as Record<string, unknown>;
  return Number.isSafeInteger(limit) && Number.isSafeInteger(used) && (limit as number) > 0 && (used as number) >= 0
    && (reserved === undefined || (Number.isSafeInteger(reserved) && (reserved as number) >= 0));
};

/** api_quota_status()의 응답을 확인한다. 모양이 다르면 null로 두고 화면에서 감춘다. */
export function parseQuotaStatus(data: unknown): QuotaStatus | null {
  if (!data || typeof data !== "object") return null;
  const { chat, realtime, reset_at, voice } = data as Record<string, unknown>;
  if (!isCount(chat) || !isCount(realtime) || !Number.isSafeInteger(reset_at) || (reset_at as number) <= 0) return null;
  if (voice !== undefined && !parseVoiceUsage(voice)) return null;
  return { ...(voice ? { voice: voice as VoiceUsage } : {}), chat: { limit: chat.limit, used: chat.used, ...(chat.reserved === undefined ? {} : { reserved: chat.reserved }) }, realtime: { limit: realtime.limit, used: realtime.used }, resetAt: reset_at as number };
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


export function parseVoiceUsage(data: unknown): VoiceUsage | null {
 if (!data || typeof data !== 'object') return null;
 const v=data as VoiceUsage;
 if(v.call_limit_seconds!==300 || typeof v.active_call!=='boolean')return null;
 for(const [period,limit] of [[v.day,600],[v.month,1800]] as const) {
  if(!period || period.limit_seconds!==limit || !Number.isFinite(period.used_seconds) || period.used_seconds<0 || !Number.isFinite(period.reset_at) || period.reset_at<=0)return null;
 }
 return v;
}
export function voiceTimeLeft(period: VoiceUsage['day']): string {
 const seconds=Math.max(0,Math.floor(period.limit_seconds-period.used_seconds));
 return `${Math.floor(seconds/60)}분 ${seconds%60}초`;
}
