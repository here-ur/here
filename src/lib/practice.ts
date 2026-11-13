import { type DayStat, localDate } from "./report.ts";
import { accountKey } from "./local-scope.ts";

// 대화 뒤 "해 볼 만한 작은 것" 시안. 팀이 아직 정하지 않은 기능이라 목록·문구·시점은 모두 임시값이다.
// 제안은 대화 내용으로 고르지 않는다. 정해진 목록을 날짜 순서로 돌려 보여 주고, 사용자가 고른다.
// 기록은 계정별로 이 기기에만 둔다. 서버·AI에 보내지 않는다. 안 한 날은 그냥 빈칸이고 잃는 것이 없다.

export type PracticeKind = "breath" | "write" | "body" | "rest" | "people";
export type Practice = { id: string; title: string; minutes: number; kind: PracticeKind; steps: string[] };

// 임시값: 팀이 목록·문구를 정하기 전까지의 예시. 진단·권고처럼 읽히지 않게 "해 볼 만한 것"으로만 적는다.
export const PRACTICES: Practice[] = [
  { id: "breath", title: "1분 숨 고르기", minutes: 1, kind: "breath", steps: ["코로 4초 천천히 들이쉬고", "입으로 6초 길게 내쉬어요", "다섯 번이면 1분이에요"] },
  { id: "good-line", title: "오늘 좋았던 것 한 줄", minutes: 2, kind: "write", steps: ["아주 작은 것도 괜찮아요", "머릿속에서 한 줄로 떠올려 봐요", "적고 싶으면 대화로 들려줘도 돼요"] },
  { id: "water", title: "물 한 컵 마시기", minutes: 1, kind: "body", steps: ["자리에서 한 번 일어나서", "물 한 컵을 천천히 마셔요"] },
  { id: "shoulders", title: "어깨 세 바퀴 돌리기", minutes: 1, kind: "body", steps: ["어깨를 귀 쪽으로 올렸다가", "뒤로 크게 세 바퀴 돌려요"] },
  { id: "window", title: "창밖 1분 바라보기", minutes: 1, kind: "rest", steps: ["멀리 있는 것 하나를 골라", "1분 동안 눈을 쉬게 해요"] },
  { id: "thanks", title: "고마운 사람 한 명 떠올리기", minutes: 1, kind: "people", steps: ["오늘 조금이라도 고마웠던 사람", "얼굴을 한 번 떠올려 봐요"] },
  { id: "one-thing", title: "내일 할 일 하나만 정하기", minutes: 2, kind: "write", steps: ["여러 개 말고 딱 하나만", "작을수록 좋아요"] },
  { id: "walk", title: "집 안 한 바퀴 걷기", minutes: 2, kind: "body", steps: ["휴대폰은 두고", "천천히 한 바퀴만 걸어요"] },
];

export const DAILY_COUNT = 3; // 임시값: 하루에 보여 주는 개수

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 365;

export const isPracticeId = (value: unknown): value is string => typeof value === "string" && PRACTICES.some((p) => p.id === value);
export const practiceById = (id: string) => PRACTICES.find((p) => p.id === id);

/** 그날 보여 줄 실천. 날짜 번호로 목록을 돌리기만 하고, 대화 내용은 보지 않는다. */
export function dailyPractices(date: string, count = DAILY_COUNT): Practice[] {
  const [y, m, d] = date.split("-").map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
  const start = ((dayNumber % PRACTICES.length) + PRACTICES.length) % PRACTICES.length;
  return Array.from({ length: Math.min(count, PRACTICES.length) }, (_, i) => PRACTICES[(start + i) % PRACTICES.length]);
}

// ── 이 기기의 기록: 한 날에 한 것·나중에 미룬 것·닫은 것 ──
export type PracticeLog = { done: Record<string, string[]>; later: Record<string, string[]>; closed: Record<string, string[]> };
const EMPTY: PracticeLog = { done: {}, later: {}, closed: {} };
const KEY = "here.practice.v1";

const cleanDays = (raw: unknown): Record<string, string[]> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([date, ids]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Array.isArray(ids))
      .map(([date, ids]) => [date, (ids as unknown[]).filter(isPracticeId)]),
  );
};

export function loadPractice(): PracticeLog {
  const key = accountKey(KEY);
  if (!key) return EMPTY;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!raw || typeof raw !== "object") return EMPTY;
    const r = raw as Record<string, unknown>;
    return { done: cleanDays(r.done), later: cleanDays(r.later), closed: cleanDays(r.closed) };
  } catch {
    return EMPTY;
  }
}

function save(log: PracticeLog, now: number) {
  const key = accountKey(KEY);
  if (!key) return;
  const oldest = localDate(now - KEEP_DAYS * DAY_MS);
  const trim = (days: Record<string, string[]>) => Object.fromEntries(Object.entries(days).filter(([date]) => date >= oldest));
  try { localStorage.setItem(key, JSON.stringify({ done: trim(log.done), later: trim(log.later), closed: trim(log.closed) })); } catch {}
}

function add(log: PracticeLog, bucket: keyof PracticeLog, id: string, now: number): PracticeLog {
  const date = localDate(now);
  const list = log[bucket][date] ?? [];
  if (list.includes(id)) return log;
  return { ...log, [bucket]: { ...log[bucket], [date]: [...list, id] } };
}

/** 했어요. 같은 날 같은 실천은 한 번만 센다. */
export function markDone(log: PracticeLog, id: string, now = Date.now()): PracticeLog {
  if (!isPracticeId(id)) return log;
  const next = add(log, "done", id, now);
  save(next, now);
  return next;
}

/** 나중에. 오늘 목록의 뒤로 보낼 뿐, 기록에 남는 불이익은 없다. */
export function markLater(log: PracticeLog, id: string, now = Date.now()): PracticeLog {
  if (!isPracticeId(id)) return log;
  const next = add(log, "later", id, now);
  save(next, now);
  return next;
}

/** 닫기. 오늘은 그 제안을 다시 보여 주지 않는다. */
export function markClosed(log: PracticeLog, id: string, now = Date.now()): PracticeLog {
  if (!isPracticeId(id)) return log;
  const next = add(log, "closed", id, now);
  save(next, now);
  return next;
}

export function clearPractice() {
  const key = accountKey(KEY);
  if (key) try { localStorage.removeItem(key); } catch {}
}

/** 지금 보여 줄 제안 하나. 한 것·닫은 것은 빼고, 나중에로 미룬 것은 뒤로 보낸다. 다 했으면 null. */
export function nextPractice(log: PracticeLog, now = Date.now()): Practice | null {
  const date = localDate(now);
  const done = new Set(log.done[date] ?? []);
  const closed = new Set(log.closed[date] ?? []);
  const later = new Set(log.later[date] ?? []);
  const today = dailyPractices(date).filter((p) => !done.has(p.id) && !closed.has(p.id));
  return today.find((p) => !later.has(p.id)) ?? today[0] ?? null;
}

export const isDone = (log: PracticeLog, id: string, now = Date.now()) => (log.done[localDate(now)] ?? []).includes(id);

// ── 가벼운 게임 요소: 이번 주 요일 체크와 쌓인 실천 수 ──
// "연속 N일" 같은 스트릭은 두지 않는다. 쉰 날은 그냥 빈칸이다.
export type WeekCheck = { date: string; weekday: number; talked: boolean; practiced: boolean; today: boolean; future: boolean };

/** 이번 주(월~일) 요일별 체크. talked는 그날 대화가 있었는지, practiced는 그날 실천이 하나라도 있었는지. */
export function weekChecks(days: DayStat[], log: PracticeLog, now = Date.now()): WeekCheck[] {
  const todayDate = localDate(now);
  const d = new Date(now);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const talked = new Set(days.filter((day) => day.said > 0).map((day) => day.date));
  return Array.from({ length: 7 }, (_, i) => {
    const date = localDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i).getTime());
    return { date, weekday: (i + 1) % 7, talked: talked.has(date), practiced: (log.done[date] ?? []).length > 0, today: date === todayDate, future: date > todayDate };
  });
}

/** 지금까지 쌓인 실천 수(날짜·종류 상관없이 한 번씩). */
export const practiceTotal = (log: PracticeLog) => Object.values(log.done).reduce((sum, ids) => sum + ids.length, 0);
