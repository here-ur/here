// 서버 전용. 환경값은 /api/chat만 전달하며, 음성용 OpenAI 키로 대체하지 않는다.
// 요청 읽기·주소·오류 변환은 리포트 하늘 고르기(report-sky-server.ts)도 함께 쓴다.
import { hasCrisisSignal } from "./crisis.ts";
import { cleanName, cleanNickname, isStyleId, type Answers } from "./onboarding.ts";
import { companionPrompt } from "./companion-prompt.ts";
import { operationMetric, usageMetric } from "./ai-operations.ts";
import type { ConversationContext } from './conversation-context.ts';

const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 60_000;
const MAX_REQUEST_BYTES = 256 * 1024;
export const MAX_RESPONSE_BYTES = 1024 * 1024;
export const DEFAULT_BASE_URL = "https://api.runyour.ai/v1";
export const DEFAULT_MODEL = "openai/gpt-5.6-sol";

type Message = { role: "user" | "assistant"; content: string };
type Flags = { crisis: boolean; suggest: boolean };

export type ChatServerConfig = {
  hereName?: string;
  onboardingAnswers?: Answers;
  mode?: "chat" | "voice";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  prepareContext?: (messages: Message[], signal: AbortSignal) => Promise<ConversationContext>;
  contextRequired?: boolean;
  onExchange?: (messages: Message[], reply: string) => Promise<void | { assistantAt: number }>;
  memory?: {
    recall(messages: Message[], signal: AbortSignal): Promise<string>;
    schedule(messages: Message[]): void;
  };
};

export class ChatFailure extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const INVALID_REQUEST = "메시지 형식을 확인해 주세요.";
const INVALID_RESPONSE = "답변을 받지 못했어요. 잠시 뒤 다시 보내 주세요.";
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Content-Length가 없거나 잘못돼도 실제 읽은 바이트 수로 제한한다. */
export async function readJson(source: Request | Response, limit: number, signal: AbortSignal, upstream = false): Promise<unknown> {
  const fail = () => new ChatFailure(upstream ? 502 : 400, upstream ? INVALID_RESPONSE : INVALID_REQUEST);
  const tooLarge = () => new ChatFailure(upstream ? 502 : 413, upstream ? INVALID_RESPONSE : "대화 내용이 너무 길어요. 내용을 줄여서 다시 보내 주세요.");
  const length = source.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    void source.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!source.body) throw fail();
  const reader = source.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        cancel();
        throw tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    cancel();
    if (signal.aborted || error instanceof ChatFailure) throw error;
    throw fail();
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function validateInput(body: unknown): { messages: Message[]; name: string; user: { nickname?: unknown; style?: unknown } } {
  if (!isRecord(body) || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_MESSAGES) {
    throw new ChatFailure(400, INVALID_REQUEST);
  }
  // 캐릭터 이름·사용자가 불러 달라고 한 이름은 짧은 문자열만 받고, 지시문에 넣기 전에 다시 거른다.
  // 대화 방식은 정해진 값일 때만 쓰고, 모르는 값은 대화를 막지 않고 무시한다.
  for (const value of [body.name, body.nickname]) {
    if (value !== undefined && (typeof value !== "string" || value.length > 100)) throw new ChatFailure(400, INVALID_REQUEST);
  }
  let chars = 0;
  const messages = body.messages.map((message): Message => {
    if (!isRecord(message) || (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") {
      throw new ChatFailure(400, INVALID_REQUEST);
    }
    const content = message.content.trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) throw new ChatFailure(400, INVALID_REQUEST);
    chars += content.length;
    // 명시적으로 허용한 두 필드만 전달한다. system/tool/추가 명령 필드는 받지 않는다.
    return { role: message.role, content };
  });
  if (chars > MAX_TOTAL_CHARS) throw new ChatFailure(413, "대화 내용이 너무 길어요. 내용을 줄여서 다시 보내 주세요.");
  if (messages.at(-1)?.role !== "user") throw new ChatFailure(400, INVALID_REQUEST);
  return { messages, name: cleanName(typeof body.name === "string" ? body.name : ""), user: { nickname: cleanNickname(body.nickname), style: isStyleId(body.style) ? body.style : undefined } };
}

export function endpoint(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/responses`;
    return url.toString();
  } catch {
    throw new ChatFailure(503, "채팅 연결 설정을 확인해 주세요.");
  }
}

export function providerFailure(status: number) {
  if (status === 401 || status === 403) return new ChatFailure(503, "채팅 연결 인증을 확인해 주세요.");
  if (status === 429) return new ChatFailure(429, "지금은 요청이 많아요. 잠시 뒤 다시 보내 주세요.");
  if (status === 408 || status === 504) return new ChatFailure(504, "답변 시간이 길어졌어요. 잠시 뒤 다시 보내 주세요.");
  if (status >= 500) return new ChatFailure(503, "채팅 서비스가 잠시 어려워요. 조금 뒤 다시 보내 주세요.");
  return new ChatFailure(502, "채팅 모델 또는 연결 설정을 확인해 주세요.");
}

function completion(data: unknown) {
  if (!isRecord(data) || !Array.isArray(data.output) || data.output.length > 20) throw new ChatFailure(502, INVALID_RESPONSE);
  const text: string[] = [];
  for (const item of data.output) {
    if (!isRecord(item)) throw new ChatFailure(502, INVALID_RESPONSE);
    if (item.type === "message") {
      if (item.role !== "assistant" || !Array.isArray(item.content) || (item.status !== undefined && item.status !== "completed")) {
        throw new ChatFailure(502, INVALID_RESPONSE);
      }
      for (const part of item.content) {
        if (!isRecord(part)) throw new ChatFailure(502, INVALID_RESPONSE);
        if (part.type === "output_text" && typeof part.text === "string") text.push(part.text);
        else if (part.type === "refusal" && typeof part.refusal === "string") text.push(part.refusal);
        else throw new ChatFailure(502, INVALID_RESPONSE);
      }
    } else if (item.type !== "reasoning") {
      throw new ChatFailure(502, INVALID_RESPONSE);
    }
  }
  const reply = text.join("\n").trim();
  if (data.status !== "completed" || reply.length > MAX_MESSAGE_CHARS) throw new ChatFailure(502, INVALID_RESPONSE);
  return { reply };
}

/** fetch/config 주입으로 실제 키·네트워크 없이 전체 서버 경로를 검증한다. */
export async function chatResponse(request: Request, config: ChatServerConfig): Promise<Response> {
  const started = Date.now();
  const flags: Flags = { crisis: false, suggest: false };
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutMs ?? 45_000);
  const json = (body: object, status = 200) => {
    operationMetric({ operation: "chat", outcome: status === 200 ? "ok" : "failed", status, durationMs: Date.now() - started });
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  };
  try {
    controller.signal.throwIfAborted();
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new ChatFailure(415, "JSON 형식의 메시지를 보내 주세요.");
    const { messages } = validateInput(await readJson(request, MAX_REQUEST_BYTES, controller.signal));
    flags.crisis = messages.some((message) => message.role === "user" && hasCrisisSignal(message.content));
    const key = config.apiKey?.trim();
    if (!key) throw new ChatFailure(503, "채팅 연결이 아직 설정되지 않았어요.");
    const url = endpoint(config.baseUrl?.trim() || DEFAULT_BASE_URL);
    const model = config.model?.trim() || DEFAULT_MODEL;
    let context: ConversationContext | undefined;
    try { context = await config.prepareContext?.(messages, controller.signal); }
    catch { if (config.contextRequired) throw new ChatFailure(503, '대화 맥락을 불러오지 못했어요. 잠시 뒤 다시 보내 주세요.'); }
    if (config.contextRequired && !context) throw new ChatFailure(503, '대화 맥락을 불러오지 못했어요. 잠시 뒤 다시 보내 주세요.');
    const call = async () => {
      controller.signal.throwIfAborted();
      const response = await (config.fetch ?? fetch)(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        // 음성 위임은 추론 대기를 줄이고, 글 대화는 기존 추론 수준을 유지한다.
        body: JSON.stringify({
          model,
          instructions: companionPrompt(config.onboardingAnswers, context, { hereName: config.hereName, recentMessages: messages, mode: config.mode ?? 'chat' }),
          input: messages,
          stream: false,
          store: false,
          reasoning: { effort: config.mode === "voice" ? "low" : "medium" },
          include: ["reasoning.encrypted_content"],
          max_output_tokens: 4_096,
          tools: [],
          tool_choice: "none",
        }),
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
      });
      controller.signal.throwIfAborted();
      if (!response.ok) {
        // 제공자 오류 본문은 개인정보·키를 포함할 수 있어 읽거나 로그로 남기지 않는다.
        void response.body?.cancel().catch(() => {});
        throw providerFailure(response.status);
      }
      const body = await readJson(response, MAX_RESPONSE_BYTES, controller.signal, true);
      usageMetric("chat", body);
      return completion(body);
    };
    const result = await call();
    if (!result.reply) throw new ChatFailure(502, INVALID_RESPONSE);
    try { config.memory?.schedule(messages); } catch { /* Saving memory must not fail a successful reply. */ }
    const reply = result.reply;
    let saved: void | { assistantAt: number } = undefined;
    try { saved = await config.onExchange?.(messages, reply); } catch { /* Client durable outbox retries with the same message IDs. */ }
    return json({ reply, ...flags, ...(saved ? { assistantAt: saved.assistantAt } : {}) });
  } catch (error) {
    if (request.signal.aborted) return json({ error: "요청을 취소했어요.", ...flags }, 499);
    if (timedOut) return json({ error: "답변 시간이 길어졌어요. 잠시 뒤 다시 보내 주세요.", ...flags }, 504);
    if (error instanceof ChatFailure) return json({ error: error.message, ...flags }, error.status);
    // 예외 메시지·요청 내용·인증 정보를 응답이나 로그로 전달하지 않는다.
    return json({ error: "채팅에 연결하지 못했어요. 잠시 뒤 다시 보내 주세요.", ...flags }, 502);
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
  }
}
