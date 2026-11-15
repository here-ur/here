// v2: 마이크 안내가 첫 실행에서 '홈에서 처음 마이크를 누를 때'로 옮겨 오면서, 이제는 안내를 거쳐 허용했을 때만 기록한다.
// 예전(v1)에는 '나중에 할게요'로 넘겨도 기록해서, 그 기록을 그대로 쓰면 새 안내를 한 번도 못 보는 사람이 생긴다.
const NOTICE_KEY = "here:microphone-notice:v2";
let noticedInTab = false;

export function microphoneNoticeSeen(): boolean {
  if (noticedInTab) return true;
  try { return localStorage.getItem(NOTICE_KEY) === "seen"; } catch { return false; }
}

// This only remembers the introduction, never grants or proves microphone access.
export function markMicrophoneNoticeSeen() {
  noticedInTab = true;
  try { localStorage.setItem(NOTICE_KEY, "seen"); } catch { /* In-memory fallback. */ }
}

export async function microphonePermission(nav: Pick<Navigator, "permissions">): Promise<PermissionState | "unknown"> {
  try {
    const result = await nav.permissions.query({ name: "microphone" as PermissionName });
    return result.state;
  } catch { return "unknown"; }
}

// Ask from a user gesture, then immediately release every track. No recorder or network call.
// Even if the screen is unmounted while the browser prompt is open, late streams are stopped.
export async function requestMicrophonePermission(devices: Pick<MediaDevices, "getUserMedia">): Promise<void> {
  const stream = await devices.getUserMedia({ audio: true });
  stream.getTracks().forEach(track => track.stop());
}

export function microphoneErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotFoundError") return "브라우저에서 마이크 입력 장치를 찾지 못했어요. 기기의 소리 설정에서 입력 장치를 확인해 주세요.";
  if (name === "NotReadableError" || name === "AbortError") return "브라우저에서 마이크 입력 장치를 열지 못했어요. 기기의 마이크 접근 설정과 입력 장치를 확인해 주세요.";
  return "마이크를 사용할 수 없어요. 브라우저의 사이트 권한과 기기의 마이크 접근 설정을 확인해 주세요.";
}

/** 홈의 마이크 버튼을 눌렀을 때 다음 할 일. 안내를 거쳐 허용했거나(seen) 브라우저가 마이크를 지원하지 않으면 바로 연결(start)하고,
 * 아직 권한을 모르면 먼저 조회(query)한다. 조회 결과가 허용이면 바로 연결, 차단이면 차단 안내 시트(blocked), 그 밖에는 안내 시트(sheet)다. */
export function microphoneAskStep({ seen, supported, permission }: {
  seen: boolean; supported: boolean; permission?: PermissionState | "unknown";
}): "start" | "query" | "sheet" | "blocked" {
  if (seen || !supported) return "start";
  if (permission === undefined) return "query";
  if (permission === "granted") return "start";
  return permission === "denied" ? "blocked" : "sheet";
}
