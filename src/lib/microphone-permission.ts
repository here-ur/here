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
