// 홈 첫 방문 안내(무엇을 누르면 되는지)를 이미 봤는지. 이 기기에 한 번만 보여 준다.
// 저장소를 쓸 수 없으면 같은 탭 안에서만 기억한다.
const KEY = "here:home-hint:v1";
let seenInTab = false;

export function homeHintSeen(): boolean {
  if (seenInTab) return true;
  try { return localStorage.getItem(KEY) === "seen"; } catch { return false; }
}

export function markHomeHintSeen() {
  seenInTab = true;
  try { localStorage.setItem(KEY, "seen"); } catch { /* In-memory fallback. */ }
}
