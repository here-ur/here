type Stage = "connect_begin" | "peer_ready" | "player_ready" | "permission_ready" | "offer_ready" | "session_request" | "session_key" | "media_ready" | "channel_ready" | "first_audio";
export const GREETING_BUDGET_MS = 2000;
export function greetingWithinBudget(elapsedMs: number): boolean {
  return Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs <= GREETING_BUDGET_MS;
}
// Local browser diagnostics only. Never include audio, text, session IDs, or keys.
export function voiceTiming(now = () => performance.now(), sink = (line: string) => console.info(line), started = now()) {
  const seen = new Set<Stage>();
  return (stage: Stage) => {
    if (seen.has(stage)) return;
    seen.add(stage);
    const elapsedMs = now() - started;
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    // Compare the unrounded measurement: 2000.01ms must not become a passing 2000ms.
    try { sink(JSON.stringify({ event: "here_voice_timing", stage, elapsedMs,
      ...(stage === 'first_audio' ? { budgetMs: GREETING_BUDGET_MS, passed: greetingWithinBudget(elapsedMs) } : {}),
    })); } catch { /* Never interrupt audio. */ }
  };
}
