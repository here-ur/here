// 서버 전용. 환경값은 /api/chat만 전달하며, 음성용 OpenAI 키로 대체하지 않는다.
import { hasCrisisSignal } from "./crisis.ts";
import { cleanName } from "./onboarding.ts";

const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 60_000;
const MAX_REQUEST_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_BASE_URL = "https://api.runyour.ai/v1";
const DEFAULT_MODEL = "openai/gpt-5.6-sol";

type Message = { role: "user" | "assistant"; content: string };
type ToolName = "show_crisis_help" | "show_get_help";
type ToolCall = { call_id: string; name: ToolName };
type ProviderItem = Record<string, unknown>;
type Flags = { crisis: boolean; suggest: boolean };

export type ChatServerConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  memory?: {
    recall(messages: Message[], signal: AbortSignal): Promise<string>;
    schedule(messages: Message[]): void;
  };
};

class ChatFailure extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const INVALID_REQUEST = "메시지 형식을 확인해 주세요.";
const INVALID_RESPONSE = "답변을 받지 못했어요. 잠시 뒤 다시 보내 주세요.";
const TOOLS = [
  {
    type: "function",
    name: "show_crisis_help",
    description: "화면에 자살예방상담전화 109 안내를 띄운다.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "show_get_help",
    description: "실제 사람인 상담사의 예시 프로필을 살펴보는 도움받기 진입 버튼을 띄운다. 실제 상담 연결이나 예약은 제공하지 않는다.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function instructions(name: string) {
  return `너는 "${name}"(이)라는 이름의 AI 대화 상대야. 마음이 힘든 사람의 이야기를 한국어로 들어 줘.
- 따뜻한 반말로, 짧게 한두 문장씩 말해. 판단하거나 훈계하지 말고, 들은 걸 짚어 주고 한 가지만 부드럽게 물어봐.
- 지금 사용자가 보낸 말에 바로 답해. 대화 첫 메시지라도 정해진 인사를 먼저 하지 마. 이전 대화 내용을 기억하고 같은 질문을 반복하지 마.
- 뜻이 애매하면 짐작하지 말고 부드럽게 되물어. 사용자나 대화 상대의 감정을 확정하거나 분석 결과처럼 말하지 마.
- 너는 AI야. 물어보면 솔직하게 AI라고 말해. 진단하지 마. 병명, 약, 치료법, 처방을 제시하거나 특정 병원·의사를 추천하지 마.
- 자살·자해 생각이나 자신을 해칠 위험이 보이면 가장 먼저 show_crisis_help를 부르고 안전을 물어봐. 자살예방상담전화 109 안내를 확인할 수 있다고 말해.
- 어려움이 2주 넘게 이어지거나, 잠·식사·일상이 무너졌다고 하거나, 전문가 도움을 원하면 show_get_help를 부르고 "전문가와 이야기해 보는 것도 방법이야" 정도로 안내해. 진단처럼 들리지 않게 해.
- 도움받기는 실제 사람인 상담사를 고르는 화면이지만 지금은 개발용 예시 프로필만 보여 주는 프로토타입이야. 실제 상담사 연결·예약·결제는 제공하지 않아. 연결이나 예약을 완료했다고 말하지 마.
- 도구는 화면 안내를 표시할 뿐이야. 필요한 도구를 부른 뒤에도 사용자의 말에 답하는 한국어 문장을 꼭 남겨.`;
}

/** Content-Length가 없거나 잘못돼도 실제 읽은 바이트 수로 제한한다. */
async function readJson(source: Request | Response, limit: number, signal: AbortSignal, upstream = false): Promise<unknown> {
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

function validateInput(body: unknown): { messages: Message[]; name: string } {
  if (!isRecord(body) || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_MESSAGES) {
    throw new ChatFailure(400, INVALID_REQUEST);
  }
  if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 100)) throw new ChatFailure(400, INVALID_REQUEST);
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
  return { messages, name: cleanName(typeof body.name === "string" ? body.name : "") };
}

function endpoint(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/responses`;
    return url.toString();
  } catch {
    throw new ChatFailure(503, "채팅 연결 설정을 확인해 주세요.");
  }
}

function providerFailure(status: number) {
  if (status === 401 || status === 403) return new ChatFailure(503, "채팅 연결 인증을 확인해 주세요.");
  if (status === 429) return new ChatFailure(429, "지금은 요청이 많아요. 잠시 뒤 다시 보내 주세요.");
  if (status === 408 || status === 504) return new ChatFailure(504, "답변 시간이 길어졌어요. 잠시 뒤 다시 보내 주세요.");
  if (status >= 500) return new ChatFailure(503, "채팅 서비스가 잠시 어려워요. 조금 뒤 다시 보내 주세요.");
  return new ChatFailure(502, "채팅 모델 또는 연결 설정을 확인해 주세요.");
}

function completion(data: unknown, flags: Flags) {
  if (!isRecord(data) || !Array.isArray(data.output) || data.output.length > 20) throw new ChatFailure(502, INVALID_RESPONSE);
  const output: ProviderItem[] = [];
  const text: string[] = [];
  const calls: ToolCall[] = [];
  for (const item of data.output) {
    if (!isRecord(item)) throw new ChatFailure(502, INVALID_RESPONSE);
    if (item.type === "function_call") {
      if (typeof item.call_id !== "string" || !item.call_id || item.call_id.length > 200 || typeof item.arguments !== "string") {
        throw new ChatFailure(502, INVALID_RESPONSE);
      }
      const name = item.name;
      if (name !== "show_crisis_help" && name !== "show_get_help") throw new ChatFailure(502, INVALID_RESPONSE);
      if (name === "show_crisis_help") flags.crisis = true;
      if (name === "show_get_help") flags.suggest = true;
      if (calls.length >= 4 || calls.some((call) => call.call_id === item.call_id)) throw new ChatFailure(502, INVALID_RESPONSE);
      // 도구는 UI 신호뿐이며 인자를 코드로 실행하지 않는다.
      calls.push({ call_id: item.call_id, name });
    } else if (item.type === "message") {
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
    // 추론 내용은 해석·기록·클라이언트 반환하지 않고 동일 요청의 도구 후속에만 원형으로 전달한다.
    output.push(item);
  }
  const reply = text.join("\n").trim();
  if (data.status !== "completed" || reply.length > MAX_MESSAGE_CHARS) throw new ChatFailure(502, INVALID_RESPONSE);
  return { reply, calls, output };
}

/** fetch/config 주입으로 실제 키·네트워크 없이 전체 서버 경로를 검증한다. */
export async function chatResponse(request: Request, config: ChatServerConfig): Promise<Response> {
  const flags: Flags = { crisis: false, suggest: false };
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutMs ?? 45_000);
  const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    controller.signal.throwIfAborted();
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) throw new ChatFailure(415, "JSON 형식의 메시지를 보내 주세요.");
    const { messages, name } = validateInput(await readJson(request, MAX_REQUEST_BYTES, controller.signal));
    flags.crisis = messages.some((message) => message.role === "user" && hasCrisisSignal(message.content));
    const key = config.apiKey?.trim();
    if (!key) throw new ChatFailure(503, "채팅 연결이 아직 설정되지 않았어요.");
    const url = endpoint(config.baseUrl?.trim() || DEFAULT_BASE_URL);
    const model = config.model?.trim() || DEFAULT_MODEL;
    const history: ProviderItem[] = [...messages];
    let remembered = "";
    try { remembered = await config.memory?.recall(messages, controller.signal) ?? ""; } catch { /* Chat still works without memory. */ }
    const call = async (followUp: boolean) => {
      controller.signal.throwIfAborted();
      const response = await (config.fetch ?? fetch)(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        // Responses에서 추론과 function tools를 함께 쓴다. 답변·추론을 합쳐 4,096토큰으로 제한한다.
        body: JSON.stringify({
          model,
          instructions: instructions(name) + remembered,
          input: history,
          stream: false,
          store: false,
          reasoning: { effort: "medium" },
          include: ["reasoning.encrypted_content"],
          max_output_tokens: 4_096,
          tools: TOOLS,
          tool_choice: followUp ? "none" : "auto",
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
      return completion(await readJson(response, MAX_RESPONSE_BYTES, controller.signal, true), flags);
    };
    let result = await call(false);
    if (!result.reply && result.calls.length) {
      // store:false이므로 reasoning/function_call 항목까지 보존해 한 번의 도구 후속을 이어 간다.
      history.push(...result.output);
      for (const tool of result.calls) history.push({ type: "function_call_output", call_id: tool.call_id, output: '{"shown":true}' });
      result = await call(true); // 도구만 답했을 때 문장 응답을 한 번만 더 요청한다.
    }
    if (!result.reply) throw new ChatFailure(502, INVALID_RESPONSE);
    try { config.memory?.schedule(messages); } catch { /* Saving memory must not fail a successful reply. */ }
    return json({ reply: result.reply, ...flags });
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
