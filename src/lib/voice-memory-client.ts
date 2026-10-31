import type { VoiceMemoryInput } from "./voice-memory-protocol.ts";

export class VoiceMemoryAccessError extends Error {}

export async function requestVoiceMemory(input: VoiceMemoryInput, token: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch("/api/voice-memory", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
    // Save final utterances even when the user closes the voice controls immediately.
    keepalive: input.action === "remember",
    signal: AbortSignal.any([AbortSignal.timeout(8000), ...(signal ? [signal] : [])]),
  });
  if (response.status === 401 || response.status === 403) throw new VoiceMemoryAccessError("회원 또는 동의 상태를 다시 확인해 주세요.");
  if (!response.ok) throw new Error("voice_memory_unavailable");
  const body = await response.json();
  if (input.action === "remember") {
    if (response.status !== 202 || body.accepted !== true) throw new Error("voice_memory_invalid");
    return "";
  }
  if (typeof body.context !== "string" || body.context.length > 8000) throw new Error("voice_memory_invalid");
  return body.context;
}
