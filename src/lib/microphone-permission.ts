const NOTICE_KEY = "here:microphone-notice:v1";
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
