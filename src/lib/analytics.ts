// 제품 분석(PostHog). 기준: docs/ANALYTICS.md.
// 무슨 일이 있었는지(단계·버튼·성공/실패)만 보낸다. 대화 원문·받아쓴 말·이름·표정(하늘)·위기 여부·동의 답·생일·성별은 보내지 않는다.
// 아래 EVENTS에 적힌 이벤트·속성·값만 나가고, 그 밖의 것은 보내기 직전에 한 번 더 걸러 버린다.
// 키(NEXT_PUBLIC_POSTHOG_KEY)가 있는 배포에서만 켜진다. 어느 서버에서 켤지는 Vercel 환경변수로 정한다(운영 포함, 2026-11-28).

import { STAGE_SCENES } from "./onboarding.ts";

const REPORT_MODES = ["insight", "library"] as const;
const SOON_FEATURES = ["help", "friends", "garden"] as const;
const VOICE_FAILURES = ["no_mic", "error"] as const;

type Spec = Record<string, readonly string[] | "count">;

/** 보낼 수 있는 이벤트와 속성. 문자열 속성은 정해진 값만, "count"는 0 이상의 정수만 받는다. */
export const EVENTS = {
  onboarding_step_viewed: { scene: STAGE_SCENES }, // 캐릭터 만나기 무대의 장면 이름(들은 것 정리는 meet에 포함)
  onboarding_completed: {},
  home_viewed: {},
  menu_opened: {},
  text_opened: {},
  chat_message_sent: {},
  chat_reply_received: {},
  chat_reply_failed: {},
  voice_started: {},
  voice_failed: { reason: VOICE_FAILURES },
  voice_ended: { seconds: "count" },
  report_opened: { mode: REPORT_MODES },
  coming_soon_shown: { feature: SOON_FEATURES },
} as const satisfies Record<string, Spec>;

export type AnalyticsEvent = keyof typeof EVENTS;
type PropsOf<S> = { -readonly [K in keyof S]: S[K] extends readonly (infer V)[] ? V : number };
export type AnalyticsProps<E extends AnalyticsEvent> = PropsOf<(typeof EVENTS)[E]>;

/** EVENTS에 맞는 속성만 남긴다. 이벤트 이름이 목록에 없으면 null(보내지 않음). */
export function cleanEvent(name: string, props: Record<string, unknown> = {}): Record<string, string | number> | null {
  if (!Object.hasOwn(EVENTS, name)) return null;
  const spec: Spec = EVENTS[name as AnalyticsEvent];
  const out: Record<string, string | number> = {};
  for (const [key, rule] of Object.entries(spec)) {
    const value = props[key];
    if (rule === "count") {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) out[key] = Math.round(value);
    } else if (typeof value === "string" && rule.includes(value)) out[key] = value;
  }
  return out;
}

// PostHog가 스스로 붙이는 속성 중 남길 것. 화면 크기·브라우저·기기·라이브러리 정보처럼 사람을 가리키지 않는 것만 둔다.
const KEEP_SYSTEM = new Set([
  "token", "distinct_id", "$device_id", "$session_id", "$window_id", "$insert_id", "$time", "$lib", "$lib_version",
  "$browser", "$browser_version", "$os", "$os_version", "$device_type", "$screen_width", "$screen_height",
  "$viewport_width", "$viewport_height", "$timezone", "$current_url", "$host", "$pathname", "$is_identified",
  "$process_person_profile", "$config_defaults", "$anon_distinct_id", "$user_id", "$set", "$set_once", "app_env",
]);
const SYSTEM_EVENTS = new Set(["$identify"]);

/** 주소는 쿼리·해시(초대 코드 등)를 빼고 경로까지만 남긴다. */
export function cleanUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return undefined; }
}

type Outgoing = { event: string; properties?: Record<string, unknown>; $set?: unknown; $set_once?: unknown };

/** 보내기 직전의 마지막 거르기. 목록에 없는 이벤트($pageview·$autocapture 등)는 버리고, 속성도 허용한 것만 남긴다. */
export function beforeSend<T extends Outgoing>(event: T | null): T | null {
  if (!event) return null;
  const own = SYSTEM_EVENTS.has(event.event) ? {} : cleanEvent(event.event, event.properties);
  if (!own) return null;
  const props: Record<string, unknown> = { ...own };
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    if (!KEEP_SYSTEM.has(key)) continue;
    if (key === "$set" || key === "$set_once") continue; // 사람 속성은 보내지 않는다
    props[key] = key === "$current_url" ? cleanUrl(value) : value;
  }
  return { ...event, properties: props, $set: undefined, $set_once: undefined } as T;
}

/** 회원 ID를 그대로 보내지 않고 한 방향 해시로 바꾼다. */
export async function analyticsId(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`here-analytics-v1:${userId}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type AnalyticsEnv = "local" | "preview" | "development" | "production";

/** 이벤트에 붙일 환경 이름(app_env). 운영은 Vercel 환경값이나 운영 주소로 알아본다. */
export function analyticsEnv(vercelEnv: string | undefined, host: string, nodeEnv: string | undefined): AnalyticsEnv {
  if (vercelEnv === "production" || host === "here-prod.vercel.app") return "production";
  if (nodeEnv === "development" || host === "localhost" || host === "127.0.0.1") return "local";
  if (host === "here-dev.vercel.app") return "development";
  return "preview";
}

type Client = {
  capture: (event: string, props?: Record<string, unknown>) => unknown;
  identify: (id: string) => void;
  reset: () => void;
};

let loading: Promise<Client | null> | null = null;
let chain: Promise<unknown> = Promise.resolve();

// 모든 호출을 한 줄로 세운다. 회원 연결(해시를 만드는 동안)이 끝나기 전에 나간 이벤트가 익명으로 남지 않게 한다.
function run(fn: (c: Client) => void | Promise<void>) {
  if (!loading) return;
  const ready = loading;
  chain = chain.then(() => ready).then((c) => (c ? fn(c) : undefined)).catch(() => {});
}

/** 앱이 처음 뜰 때 한 번 부른다(src/instrumentation-client.ts). 키가 없으면 아무것도 하지 않는다(posthog-js도 불러오지 않는다). */
export function startAnalytics(): void {
  if (loading || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const env = analyticsEnv(process.env.NEXT_PUBLIC_VERCEL_ENV, window.location.hostname, process.env.NODE_ENV);
  if (!key) return;
  loading = import("posthog-js").then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_exceptions: false,
      capture_performance: false,
      rageclick: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      save_referrer: false,
      person_profiles: "identified_only",
      persistence: "localStorage",
      // 환경 표시는 register 대신 여기서 붙인다(로그아웃 때 reset이 register한 값을 지운다).
      before_send: (event) => {
        const out = beforeSend(event);
        if (out) out.properties = { ...out.properties, app_env: env };
        return out;
      },
    });
    return posthog as Client;
  }).catch(() => null);
}

export function track<E extends AnalyticsEvent>(name: E, ...[props]: keyof AnalyticsProps<E> extends never ? [] : [AnalyticsProps<E>]): void {
  const clean = cleanEvent(name, props as Record<string, unknown> | undefined);
  if (clean) run((c) => { c.capture(name, clean); });
}

let voiceStart: number | null = null;

/** 마이크가 열린 음성 대화가 시작됐다. */
export function voiceStarted(): void {
  voiceStart = Date.now();
  track("voice_started");
}

/** 음성 대화가 끝났다. 실제로 시작된 대화만 길이(초)를 남긴다. */
export function voiceEnded(): void {
  if (voiceStart === null) return;
  const seconds = (Date.now() - voiceStart) / 1000;
  voiceStart = null;
  track("voice_ended", { seconds });
}

/** 로그인한 회원을 해시한 ID로 묶는다. */
export function identify(userId: string): void {
  run(async (c) => { c.identify(await analyticsId(userId)); });
}

/** 로그아웃·계정 전환: 다음 사람의 이벤트가 앞 사람에게 붙지 않게 한다. */
export function resetAnalytics(): void {
  voiceStart = null;
  run((c) => c.reset());
}
