// 서버 전용. 조용히 넘기던 에러를 app_errors 테이블에 "코드만" 남긴다 (0031).
// 에러 메시지 원문·스택·요청 내용·대화 내용·토큰은 절대 넘기지 않는다. detail에는 숫자·참거짓만 넣는다.
// 기록이 실패해도 원래 요청에 영향을 주지 않는다(항상 조용히 끝난다).
import type { SupabaseClient } from "@supabase/supabase-js";
import { FieldCipherError } from "./field-cipher.ts";

export type ErrorDetail = Record<string, number | boolean>;

const CODE = /^[A-Za-z0-9_.:-]{1,64}$/;
const INTERNAL = /^[a-z][a-z0-9_]{2,47}$/; // 코드에서 직접 던지는 Error('summary_save_failed') 같은 이름

/** 에러에서 원문 없이 분류 코드만 뽑는다. 감싼 에러면 원인 코드를 붙인다(예: context_unavailable:http_429). */
export function errorCode(error: unknown): string {
  const base = ownCode(error);
  const cause = error && typeof error === "object" ? (error as { cause?: unknown }).cause : undefined;
  if (cause === undefined || base === "unknown") return base;
  const inner = errorCode(cause);
  const joined = `${base}:${inner}`;
  return inner !== "unknown" && joined.length <= 64 ? joined : base;
}

function ownCode(error: unknown): string {
  if (error instanceof FieldCipherError && CODE.test(error.message)) return error.message;
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; status?: unknown; name?: unknown; message?: unknown };
    if (e.name === "TimeoutError") return "timeout";
    if (e.name === "AbortError") return "aborted";
    if (typeof e.code === "string" && CODE.test(e.code)) return e.code; // PostgREST·Postgres·Node 에러 코드
    if ((e as { kind?: unknown }).kind === "quota") return "provider_quota"; // AI 제공자 크레딧·한도 소진 (VoiceProviderError)
    if (typeof e.status === "number" && Number.isInteger(e.status)) return `http_${e.status}`;
    if (typeof e.message === "string" && INTERNAL.test(e.message)) return e.message;
  }
  return "unknown";
}

/** 우리 쪽 문제로 끝난 응답인지: 서버·AI·DB 장애(5xx)와 AI 서비스의 요청 한도 초과(429).
 * 형식 오류·로그인 만료 같은 4xx와 사용자가 끊은 499는 정상 동작이라 기록하지 않는다.
 * 우리 사용량 제한의 429는 AI 호출 전에 따로 돌려주므로 여기 들어오지 않게 호출하는 쪽에서 구분한다. */
export function isServerFailure(status: number): boolean {
  return status >= 500 || status === 429;
}

/** 실패하면 report로 알리고 같은 에러를 그대로 다시 던진다(동작은 바꾸지 않고 기록만 더한다). */
export function reportingFailures<A extends unknown[], R>(fn: (...args: A) => Promise<R>, report: (error: unknown) => void) {
  return async (...args: A): Promise<R> => {
    try { return await fn(...args); } catch (error) { report(error); throw error; }
  };
}

/** 숫자·참거짓만, 최대 10개까지 남긴다. */
function cleanDetail(detail: ErrorDetail): ErrorDetail {
  const out: ErrorDetail = {};
  for (const [key, value] of Object.entries(detail).slice(0, 10)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key)) continue;
    if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") out[key] = value;
  }
  return out;
}

/**
 * source는 "어디서"(예: chat.save). 로그인 없는 작업자는 worker.* 로만 기록된다.
 * 응답 뒤에 기록하려면 route에서 after(() => reportError(...))로 부른다.
 */
export async function reportError(client: SupabaseClient | null | undefined, source: string, error: unknown, detail: ErrorDetail = {}): Promise<void> {
  if (!client) return;
  try {
    await client.rpc("report_app_error", { p_source: source, p_code: errorCode(error), p_detail: cleanDetail(detail) })
      .abortSignal(AbortSignal.timeout(2000));
  } catch { /* 에러 기록 실패는 무시한다 */ }
}
