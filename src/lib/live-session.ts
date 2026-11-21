import type { Answers } from "./onboarding.ts";
import { companionPrompt } from "./companion-prompt.ts";
import type { ConversationContext } from './conversation-context.ts';

/** Server-owned configuration: the caller supplies SDP and persona, never model/tools/instructions. */
export function liveSessionRequest(value: unknown, model = "gpt-live-1", voice = "noeul", onboardingAnswers: Answers = {}, context?: ConversationContext, hereName?: string) {
  const body = value as Record<string, unknown> | null;
  if (!body || typeof body.sdp !== "string" || !body.sdp.startsWith("v=0") || body.sdp.length > 60_000) {
    throw new Error("invalid_sdp");
  }
  return {
    session: {
      model, instructions: companionPrompt(onboardingAnswers, context, { hereName, mode: 'voice' }), audio: { output: { voice } }, store: false,
      delegation: { type: "client" },
      input: [{ type: "message", role: "developer", content: [{ type: "input_text", text: "음성 대화가 시작되면 먼저 인사하세요." }] }],
    },
    transport: { type: "webrtc", sdp: body.sdp },
  };
}
