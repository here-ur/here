// 리포트: 대화 원문(log.ts, 30일)에서 날짜별 숫자만 모아 이 기기에 최대 1년 둔다. 서버에는 저장하지 않는다.
// 자주 한 말은 기기에서만 세고, AI에는 하늘을 고를 때 그날 내가 한 말만 보낸다.
import { hasAssistantCrisis, hasCrisisSignal } from "./crisis.ts";
import { accountKey } from "./local-scope.ts";
import type { Msg, Session } from "./log.ts";
import { isClinical } from "./clinical.ts";

export const SKIES = [
  { id: "sunny", label: "맑음" },
  { id: "cozy", label: "포근" },
  { id: "cloudy", label: "흐림" },
  { id: "rain", label: "비" },
  { id: "thunder", label: "천둥" },
  { id: "wind", label: "바람" },
] as const;
export type SkyId = (typeof SKIES)[number]["id"];
export const SKY_IDS = SKIES.map((s) => s.id) as SkyId[];

export function isSkyId(value: unknown): value is SkyId {
  return typeof value === "string" && (SKY_IDS as string[]).includes(value);
}

// ai: AI가 고른 하늘("none"은 고르지 않음), mine: 내가 고친 하늘(우선), tried: 마지막으로 AI에 물어본 시각.
export type DayStat = {
  date: string;
  said: number;
  replies: number;
  hours: number[];
  words: Record<string, number>;
  crisis: boolean;
  ai?: SkyId | "none";
  mine?: SkyId;
  tried?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 365;
const RETRY_MS = 6 * 60 * 60 * 1000;
const MAX_SKY_DAYS = 7;
const MAX_SKY_CHARS = 4_000;
const MAX_DAY_WORDS = 20;

const pad = (n: number) => String(n).padStart(2, "0");

/** 로컬 날짜. toISOString은 한국 시간 새벽을 전날로 바꾸므로 쓰지 않는다. */
export function localDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function msgTime(message: Msg, session: Session) {
  return typeof message.at === "number" && Number.isFinite(message.at) ? message.at : session.startedAt;
}

// ── 자주 한 말 ──
// 형태소 분석기 없이 한글 단어만 세는 간단한 방법이라 가끔 어색한 단어가 나올 수 있다.
const STOPWORDS = new Set(
  ("나 너 저 내 제 우리 저희 나는 내가 너는 네가 저는 제가 나도 너도 나를 너를 날 " +
    "그냥 진짜 정말 너무 아주 완전 좀 많이 조금 약간 되게 엄청 별로 그래도 그나마 " +
    "오늘 어제 내일 지금 이제 아까 요즘 요새 매일 항상 맨날 가끔 자주 계속 다시 또 막 " +
    "근데 그런데 그래서 그리고 그러니까 그러면 그럼 그래 그치 하지만 아니면 " +
    "그거 이거 저거 그게 이게 저게 그건 이건 거기 여기 저기 그때 이때 " +
    "뭐 뭔가 뭔지 뭐가 뭘 어떻게 어떡해 왜 언제 어디 누구 무슨 어떤 이런 저런 그런 이렇게 그렇게 저렇게 " +
    "같이 혼자 함께 모두 다들 전부 하나 " +
    "따로 벌써 먼저 다음 이미 아직 일단 혹시 바로 빨리 천천히 갑자기 드디어 결국 원래 사실 제일 가장 더 덜 꼭 절대 아마 대충 " +
    "있어 없어 있는 없는 있고 없고 있다 없다 했어 해서 하는 하고 해요 했어요 하면 했는데 " +
    "좋아 싫어 몰라 그래 아니 아니야 아냐 응 웅 네 예 음 흠 아 어 오 와 헐 ㅋㅋ " +
    "생각 느낌 기분 마음 정도 때문 때문에 거 것 수 게 건 걸 데 줄 듯 " +
    "몽글이").split(/\s+/),
);
// 여러 글자 조사는 떼고, 한 글자 조사는 받침이 맞을 때만 뗀다.
const LONG_PARTICLES = [
  "에서는", "에게는", "으로는", "이라고", "이라는", "한테서", "에게서", "까지는", "부터는", "에서도", "이랑은",
  "에서", "에게", "한테", "까지", "부터", "처럼", "보다", "으로", "이랑", "라고", "라는", "하고", "이나", "에는", "에도", "께서", "만큼", "밖에",
];
const AFTER_FINAL = new Set(["은", "이", "을", "과"]);
const AFTER_OPEN = new Set(["는", "가", "를", "와", "랑"]);
const ANY_FINAL = new Set(["에", "도", "만", "의", "로"]);
// 한 글자 조사처럼 끝나지만 원래 단어인 말
const KEEP = new Set(["고양이", "바나나", "어머니", "할머니", "아버지", "오이", "사이", "나이", "아이", "가을", "마을", "하늘", "구름", "바다"]);
// '산책했어'·'공부하는'처럼 하다가 붙은 말은 앞의 이름씨만 센다.
const HA_SUFFIX = /(했어요|했는데|하면서|하니까|하는데|했던|하던|했어|했다|했고|해서|하는|하고|하면|해요|한다|할래|할까|하기|해야|하자|해도)$/;
// 서술어 끝맺음(동사·형용사)으로 끝나는 말은 단어로 세지 않는다.
const ENDINGS = /(했어|했다|했는|해서|하는|한데|는데|은데|인데|싶어|싶다|싶은|같아|같은|같다|거든|잖아|니까|어서|아서|었어|았어|겠어|면서|지만|네요|어요|아요|해요|습니다|니다|는지|을까|할까|려고|으면|하다|한다|된다|됐어|되는|있다|없다|있어|없어|있는|없는|었다|았다|였다|이야|거야|는거|던데|더라|래요|대요|해줘|줄래)$/;
// 리포트에만 더하는 민감어(병명 목록에 없는 마음 상태 표현). 자주 한 말로 내보이지 않는다.
const SENSITIVE = /우울|불안|공황|죽|자살|자해|살기|사라지|외로|무기력|불면|트라우마/;

// '밀렸어'·'고쳐야'·'할지'처럼 활용된 말
const CONJUGATED = /(야지|어야|아야|여야|해야|려야|쳐야|워야|와야|봐야|져야|겨야|줘야|돼야|써야|쓰여|여서|워서|겨서|려서|쳐서|고서)$/;

function finalIndex(syllable: string) {
  const code = syllable.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 ? code % 28 : -1;
}

function hasFinal(syllable: string) {
  return finalIndex(syllable) > 0;
}

/** 'ㅆ' 받침(했·있·었)이 들어 있거나 'ㄹ' 받침 뒤에 지·게·래·까가 오면 동사·형용사로 보고 세지 않는다. */
function isPredicate(token: string) {
  if ([...token].some((syllable) => finalIndex(syllable) === 20) || CONJUGATED.test(token)) return true;
  const last = token.at(-1) ?? "";
  const prev = token.at(-2) ?? "";
  return /[지게래까]/.test(last) && finalIndex(prev) === 8;
}

/** 단어 끝 조사를 하나 뗀다. 남는 말이 한 글자면 원래 말을 알 수 없어 빈 문자열을 돌려준다. */
export function stripParticle(token: string) {
  if (KEEP.has(token)) return token;
  for (const particle of LONG_PARTICLES) {
    if (token.length - particle.length >= 2 && token.endsWith(particle)) return token.slice(0, -particle.length);
  }
  const last = token.at(-1) ?? "";
  const stem = token.slice(0, -1);
  const prev = stem.at(-1) ?? "";
  const matches = (AFTER_FINAL.has(last) && hasFinal(prev)) || (AFTER_OPEN.has(last) && !hasFinal(prev));
  if (matches) return stem.length >= 2 ? stem : "";
  if (ANY_FINAL.has(last) && stem.length >= 2) return stem;
  // '주에'처럼 한 글자 말 + 에는 원래 말을 알 수 없다. '회의'·'포도' 같은 말은 그대로 둔다.
  if (last === "에" && stem.length === 1) return "";
  return token;
}

export function countWords(texts: string[], exclude: string[] = []): Record<string, number> {
  const skip = new Set(exclude.flatMap((name) => [name, stripParticle(name)]).filter(Boolean));
  const counts = new Map<string, number>();
  for (const text of texts) {
    if (hasCrisisSignal(text)) continue;
    for (const raw of text.normalize("NFC").match(/[가-힣]+/g) ?? []) {
      if (STOPWORDS.has(raw)) continue;
      const ha = raw.match(HA_SUFFIX);
      let word: string;
      if (ha && raw.length - ha[0].length >= 2) word = raw.slice(0, -ha[0].length);
      else if (isPredicate(raw) || ENDINGS.test(raw)) continue;
      else word = stripParticle(raw);
      if (word.length < 2 || word.length > 10 || STOPWORDS.has(word) || skip.has(word) || skip.has(raw)) continue;
      if (ENDINGS.test(word) || SENSITIVE.test(word) || isClinical(word) || hasCrisisSignal(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]).slice(0, MAX_DAY_WORDS));
}

// ── 날짜별 숫자 ──
export function summarizeDays(sessions: Session[], exclude: string[] = []): DayStat[] {
  const days = new Map<string, { stat: DayStat; texts: string[] }>();
  for (const session of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    for (const message of session.messages) {
      const time = msgTime(message, session);
      const date = localDate(time);
      let entry = days.get(date);
      if (!entry) {
        entry = { stat: { date, said: 0, replies: 0, hours: Array(24).fill(0), words: {}, crisis: false }, texts: [] };
        days.set(date, entry);
      }
      const { stat } = entry;
      if (message.role === "user") {
        stat.said++;
        stat.hours[new Date(time).getHours()]++;
        entry.texts.push(message.content);
        if (hasCrisisSignal(message.content)) stat.crisis = true;
      } else {
        stat.replies++;
        if (hasAssistantCrisis(message.content)) stat.crisis = true;
      }
    }
  }
  return [...days.values()]
    .filter(({ stat }) => stat.said > 0)
    // 위기 표현이 있던 날은 자주 한 말을 세지 않는다.
    .map(({ stat, texts }) => ({ ...stat, words: stat.crisis ? {} : countWords(texts, exclude) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const total = (d: DayStat) => d.said + d.replies;

/**
 * 새로 센 날은 메시지가 같거나 많을 때만 덮는다. 원문 일부가 30일이 지나 사라진 날을 작은 숫자로 덮지 않기 위해서다.
 * 하늘(ai·mine)과 물어본 시각은 유지하고, 위기 표시는 한 번이라도 있었으면 남긴다.
 */
export function mergeDays(stored: DayStat[], fresh: DayStat[], now = Date.now()): DayStat[] {
  const byDate = new Map(stored.map((d) => [d.date, d]));
  for (const day of fresh) {
    const old = byDate.get(day.date);
    if (!old) byDate.set(day.date, day);
    else if (total(day) >= total(old)) byDate.set(day.date, { ...day, ai: old.ai, mine: old.mine, tried: old.tried, crisis: old.crisis || day.crisis, words: old.crisis || day.crisis ? {} : day.words });
    else if (day.crisis && !old.crisis) byDate.set(day.date, { ...old, crisis: true, words: {} });
  }
  const oldest = localDate(now - KEEP_DAYS * DAY_MS);
  return [...byDate.values()].filter((d) => d.date >= oldest).sort((a, b) => a.date.localeCompare(b.date));
}

// ── 저장소 ──
const KEY = "here.report.v1";
const SKY_CHOICE_KEY = "here.report-sky.v1";

function isDayStat(value: unknown): value is DayStat {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  return typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date)
    && [d.said, d.replies].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0)
    && Array.isArray(d.hours) && d.hours.length === 24 && d.hours.every((n) => typeof n === "number" && n >= 0)
    && typeof d.words === "object" && d.words !== null && Object.values(d.words).every((n) => typeof n === "number")
    && typeof d.crisis === "boolean"
    && (d.ai === undefined || d.ai === "none" || isSkyId(d.ai))
    && (d.mine === undefined || isSkyId(d.mine))
    && (d.tried === undefined || typeof d.tried === "number");
}

export function loadReport(): DayStat[] {
  const key = accountKey(KEY);
  if (!key) return [];
  try {
    const all: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(all) ? all.filter(isDayStat) : [];
  } catch {
    return [];
  }
}

export function saveReport(days: DayStat[]) {
  const key = accountKey(KEY);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(days));
  } catch {}
}

export function clearReport() {
  const key = accountKey(KEY);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

/** 원문이 지워지기 전에 날짜별 숫자로 옮겨 둔다. 홈을 열 때와 리포트를 열 때 부른다. */
export function syncReport(sessions: Session[], now = Date.now(), exclude: string[] = []): DayStat[] {
  const days = mergeDays(loadReport(), summarizeDays(sessions, exclude), now);
  saveReport(days);
  return days;
}

/** 하늘을 AI로 고를지. 처음 리포트를 열 때 한 번 묻고 이 기기에 남긴다. */
export function loadSkyChoice(): "on" | "off" | null {
  const key = accountKey(SKY_CHOICE_KEY);
  if (!key) return null;
  try {
    const value = localStorage.getItem(key);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

export function saveSkyChoice(choice: "on" | "off") {
  const key = accountKey(SKY_CHOICE_KEY);
  if (!key) return;
  try {
    localStorage.setItem(key, choice);
  } catch {}
}

// ── 하늘 ──
export function effectiveSky(day: DayStat): SkyId | undefined {
  return day.mine ?? (day.ai && day.ai !== "none" ? day.ai : undefined);
}

export function dayMessages(sessions: Session[], date: string): Msg[] {
  return [...sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .flatMap((session) => session.messages.filter((message) => localDate(msgTime(message, session)) === date));
}

/** AI에 하늘을 물어볼 지난 날. 오늘은 하루가 끝난 뒤에 고른다. 위기 날·고친 날·원문이 없는 날은 보내지 않는다. */
export function pendingSkyDays(days: DayStat[], sessions: Session[], now = Date.now(), limit = MAX_SKY_DAYS) {
  const today = localDate(now);
  const pending: { date: string; text: string }[] = [];
  for (const day of [...days].sort((a, b) => b.date.localeCompare(a.date))) {
    if (pending.length >= limit) break;
    if (day.date >= today || day.crisis || day.ai !== undefined || day.mine !== undefined) continue;
    if (day.tried !== undefined && now - day.tried < RETRY_MS) continue;
    const said = dayMessages(sessions, day.date).filter((m) => m.role === "user").map((m) => m.content.trim()).filter(Boolean);
    const text = said.join("\n");
    if (!text || (said.length < 2 && text.length < 20) || said.some(hasCrisisSignal)) continue;
    pending.push({ date: day.date, text: text.slice(-MAX_SKY_CHARS) });
  }
  return pending;
}

export type SkyResult = { date: string; sky: SkyId | null; crisis: boolean };

export function applySkyResults(days: DayStat[], asked: string[], results: SkyResult[], now = Date.now()): DayStat[] {
  return days.map((day) => {
    if (!asked.includes(day.date)) return day;
    const result = results.find((r) => r.date === day.date);
    if (!result) return { ...day, tried: now };
    if (result.crisis) return { ...day, crisis: true, words: {}, tried: now };
    return { ...day, ai: result.sky ?? "none", tried: now };
  });
}

/** 내가 고친 하늘. undefined면 AI가 고른 하늘로 되돌린다. */
export function setMySky(days: DayStat[], date: string, sky: SkyId | undefined): DayStat[] {
  return days.map((day) => {
    if (day.date !== date) return day;
    const copy = { ...day };
    if (sky) copy.mine = sky;
    else delete copy.mine;
    return copy;
  });
}

// ── 화면용 ──
export type Month = { year: number; month: number };

/** 최근 12개월 중 기록이 있는 달과 이번 달. 오래된 달부터. */
export function reportMonths(days: DayStat[], now = Date.now()): Month[] {
  const d = new Date(now);
  const months: Month[] = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const month = { year: m.getFullYear(), month: m.getMonth() + 1 };
    const prefix = `${month.year}-${pad(month.month)}-`;
    if (i === 0 || days.some((day) => day.date.startsWith(prefix))) months.push(month);
  }
  return months;
}

export const BUCKETS = [
  { id: "morning", label: "아침", hours: [5, 6, 7, 8, 9, 10] },
  { id: "day", label: "낮", hours: [11, 12, 13, 14, 15, 16] },
  { id: "evening", label: "저녁", hours: [17, 18, 19, 20, 21] },
  { id: "night", label: "밤", hours: [22, 23, 0, 1, 2, 3, 4] },
] as const;

export type MonthView = {
  days: DayStat[];
  talked: number;
  said: number;
  skies: { id: SkyId; label: string; count: number }[];
  noSky: number;
  words: { word: string; count: number }[];
  buckets: { id: string; label: string; count: number }[];
  peak: number | null;
};

export function monthView(days: DayStat[], year: number, month: number): MonthView {
  const prefix = `${year}-${pad(month)}-`;
  const inMonth = days.filter((d) => d.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));
  const hours = Array<number>(24).fill(0);
  const words = new Map<string, number>();
  for (const day of inMonth) {
    day.hours.forEach((n, h) => { hours[h] += n; });
    for (const [word, n] of Object.entries(day.words)) words.set(word, (words.get(word) ?? 0) + n);
  }
  const skies = SKIES.map((s) => ({ id: s.id, label: s.label, count: inMonth.filter((d) => effectiveSky(d) === s.id).length }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  const counted = hours.reduce((a, b) => a + b, 0);
  let peak: number | null = null;
  if (inMonth.length >= 3 && counted >= 3) {
    let best = -1;
    for (let h = 0; h < 24; h++) {
      const sum = hours[h] + hours[(h + 1) % 24];
      if (sum > best) { best = sum; peak = h; }
    }
  }
  return {
    days: inMonth,
    talked: inMonth.length,
    said: inMonth.reduce((a, d) => a + d.said, 0),
    skies,
    noSky: inMonth.filter((d) => !effectiveSky(d)).length,
    words: [...words].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([word, count]) => ({ word, count })),
    buckets: BUCKETS.map((b) => ({ id: b.id, label: b.label, count: (b.hours as readonly number[]).reduce((a: number, h: number) => a + hours[h], 0) })),
    peak,
  };
}

// ── 요청 ──
export class ReportSkyError extends Error {
  readonly status: number;
  readonly retryAfter?: number;

  constructor(message: string, status = 0, retryAfter?: number) {
    super(message);
    this.name = "ReportSkyError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requestReportSky(days: { date: string; text: string }[], signal?: AbortSignal, accessToken?: string): Promise<SkyResult[]> {
  let response: Response;
  try {
    response = await fetch("/api/report-sky", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ days }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    throw new ReportSkyError("하늘을 고르지 못했어요.");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    payload = null;
  }
  if (!response.ok) {
    const retry = Number(response.headers.get("retry-after"));
    const message = isRecord(payload) && typeof payload.error === "string" ? payload.error.slice(0, 300) : "하늘을 고르지 못했어요.";
    throw new ReportSkyError(message, response.status, Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
  if (!isRecord(payload) || !Array.isArray(payload.days)) throw new ReportSkyError("하늘을 확인하지 못했어요.", response.status);
  const asked = new Set(days.map((d) => d.date));
  const results: SkyResult[] = [];
  for (const item of payload.days) {
    if (!isRecord(item) || typeof item.date !== "string" || !asked.has(item.date) || typeof item.crisis !== "boolean") continue;
    if (item.sky !== null && !isSkyId(item.sky)) continue;
    if (results.some((r) => r.date === item.date)) continue;
    results.push({ date: item.date, sky: item.crisis ? null : item.sky, crisis: item.crisis });
  }
  return results;
}
