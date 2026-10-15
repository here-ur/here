// 내 기록: 대화를 이 기기의 브라우저(localStorage)에만 남긴다. 서버로 보내지 않는다.
// ponytail: 기기를 바꾸거나 브라우저 데이터를 지우면 사라진다. 계정이 생기면 서버 저장을 검토한다.

export type Msg = { role: "user" | "assistant"; content: string };
export type Session = { id: string; startedAt: number; messages: Msg[] };

const KEY = "here.log.v1";
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export function loadLog(now = Date.now()): Session[] {
  try {
    const all: Session[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return all.filter((s) => now - s.startedAt < KEEP_MS && s.messages.length > 0);
  } catch {
    return [];
  }
}

export function saveSession(session: Session) {
  try {
    const rest = loadLog().filter((s) => s.id !== session.id);
    localStorage.setItem(KEY, JSON.stringify([session, ...rest]));
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 기록 없이 대화만 한다.
  }
}

export function clearLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
