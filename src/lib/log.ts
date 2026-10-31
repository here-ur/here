// 임시 기록은 계정별로 이 기기의 브라우저에만 둔다. 서버 동기화는 별도 작업이다.
import { accountKey } from "./local-scope.ts";

export type Msg = { role: "user" | "assistant"; content: string };
export type Session = { id: string; startedAt: number; messages: Msg[] };

const KEY = "here.log.v1";
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export function loadLog(now = Date.now()): Session[] {
  const key = accountKey(KEY);
  if (!key) return [];
  try {
    const all: Session[] = JSON.parse(localStorage.getItem(key) ?? "[]");
    return all.filter((s) => now - s.startedAt < KEEP_MS && s.messages.length > 0);
  } catch {
    return [];
  }
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
