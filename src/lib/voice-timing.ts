type Stage = "session_key" | "media_ready" | "channel_ready" | "first_audio";
// Local browser diagnostics only. Never include audio, text, session IDs, or keys.
export function voiceTiming(now = () => performance.now(), sink = (line: string) => console.info(line)) {
  const started = now();
  const seen = new Set<Stage>();
  return (stage: Stage) => {
    if (seen.has(stage)) return;
    seen.add(stage);
    const elapsedMs = Math.round(now() - started);
    if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) return;
    try { sink(JSON.stringify({ event: "here_voice_timing", stage, elapsedMs })); } catch { /* Never interrupt audio. */ }
  };
}
