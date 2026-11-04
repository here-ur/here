// 임시 기록은 계정별로 이 기기의 브라우저에만 둔다. 서버 동기화는 별도 작업이다.
// 원문은 30일만 두고, 리포트(report.ts)가 지워지기 전에 날짜별 숫자로 옮겨 둔다.
import { accountKey } from "./local-scope.ts";

// at은 메시지를 남긴 시각이다(기기에만 두고 AI 요청에는 보내지 않는다). 예전 기록에는 없어서 세션 시작 시각으로 대신한다.
export type Msg = { role: "user" | "assistant"; content: string; at?: number };
export type Session = { id: string; startedAt: number; messages: Msg[] };

const KEY = "here.log.v1";
export const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** 30일 필터 없이 저장된 그대로 읽는다. 리포트가 원문이 지워지기 전에 숫자를 옮길 때만 쓴다. */
export function loadStoredSessions(): Session[] {
  const key = accountKey(KEY);
  if (!key) return [];
  try {
    const all: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(all) ? all.filter((s): s is Session => typeof s?.startedAt === "number" && Array.isArray(s?.messages)) : [];
  } catch {
    return [];
  }
}

export function loadLog(now = Date.now()): Session[] {
  return loadStoredSessions().filter((s) => now - s.startedAt < KEEP_MS && s.messages.length > 0);
}

/** 30일이 지난 원문을 실제로 지운다. 대화가 없어 저장이 일어나지 않아도 오래 남지 않게 한다. */
export function pruneLog(now = Date.now()) {
  const key = accountKey(KEY);
  if (!key) return;
  try {
    const stored = loadStoredSessions();
    const kept = loadLog(now);
    if (kept.length !== stored.length) localStorage.setItem(key, JSON.stringify(kept));
  } catch {}
}

export function saveSession(session: Session) {
  const key = accountKey(KEY);
  if (!key) return;
  try {
    const rest = loadLog().filter((s) => s.id !== session.id);
    localStorage.setItem(key, JSON.stringify([session, ...rest]));
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 기록 없이 대화만 한다.
  }
}

export function clearLog() {
  const key = accountKey(KEY);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {}
}
