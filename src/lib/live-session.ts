import type { MemoryMessage } from './memory.ts';
import type { Answers } from "./onboarding.ts";
import { companionPrompt } from "./companion-prompt.ts";
import type { ConversationContext } from './conversation-context.ts';

/** Server-owned configuration: the caller supplies SDP and persona, never model/tools/instructions. */
export function liveSessionRequest(value: unknown, model = "gpt-live-1", voice = "noeul", onboardingAnswers: Answers = {}, context?: ConversationContext, hereName?: string, recentMessages: MemoryMessage[] = []) {
  const body = value as Record<string, unknown> | null;
  if (!body || typeof body.sdp !== "string" || !body.sdp.startsWith("v=0") || body.sdp.length > 60_000
    || (body.dcid !== undefined && body.dcid !== 4)
    || (body.standby !== undefined && body.standby !== false)) {
    throw new Error("invalid_sdp");
  }
  return {
    session: {
      model, instructions: companionPrompt(onboardingAnswers, context, { hereName, mode: 'voice', recentMessages }), audio: { output: { voice } }, store: false,
      delegation: { type: "client" },
      input: [{ type: "message", role: "developer", content: [{ type: "input_text", text: "사용자가 먼저 말하기를 기다리지 말고, 지금 바로 한국어로 짧게 인사하세요. 인사한 뒤에는 사용자의 말을 기다리세요." }] }],
    },
    transport: { type: "webrtc", sdp: body.sdp, ...(body.dcid === 4 ? { dcid: 4 } : {}) },
  };
}
