import { JsonRequestError, readSmallJson } from "./request-json.ts";
import { parseVoiceMemoryInput } from "./voice-memory-protocol.ts";
import type { MemoryMessage } from "./memory.ts";

type Dependencies = {
  recall(messages: MemoryMessage[], signal: AbortSignal): Promise<string>;
  schedule(messages: MemoryMessage[], sourceId: string): void;
  checkConsent(): Promise<Response | null>;
};
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Caller verifies member and development environment first. Never accept a user ID from the body.
export async function voiceMemoryResponse(request: Request, deps: Dependencies): Promise<Response> {
  try {
    const input = parseVoiceMemoryInput(await readSmallJson(request, 5000, 32768));
    if (!input) return json({ error: "음성 기억 요청을 확인해 주세요." }, 400);
    const denied = await deps.checkConsent();
    if (denied) return denied;
    const messages: MemoryMessage[] = [{ role: "user", content: input.text }];
    if (input.action === "remember") {
      deps.schedule(messages, input.sourceId);
      // Accepted is not a promise that the asynchronous summarizer found a fact or saved it.
      return json({ accepted: true }, 202);
    }
    const context = await deps.recall(messages, request.signal);
    const revoked = await deps.checkConsent();
    if (revoked) return revoked;
    return json({ context });
  } catch (error) {
    return error instanceof JsonRequestError ? json({ error: error.message }, error.status)
      : json({ error: "기억을 확인하지 못했어요." }, 503);
  }
}
