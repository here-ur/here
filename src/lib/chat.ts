import type { Msg } from "./log.ts";

export type ChatReply = {
  reply: string;
  crisis: boolean;
  suggest: boolean;
};

export class ChatRequestError extends Error {
  readonly crisis: boolean;
  readonly suggest: boolean;

  constructor(message: string, crisis = false, suggest = false) {
    super(message);
    this.name = "ChatRequestError";
    this.crisis = crisis;
    this.suggest = suggest;
  }
}

const REQUEST_ERROR = "대화를 이어가지 못했어요. 잠시 후 다시 시도해 주세요.";
const RESPONSE_ERROR = "답변을 확인하지 못했어요. 다시 시도해 주세요.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAborted(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === "AbortError");
}

export async function requestChat(
  messages: Msg[],
  name: string,
  signal?: AbortSignal,
  accessToken?: string,
): Promise<ChatReply> {
  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ messages, name }),
      signal,
    });
  } catch (error) {
    if (isAborted(error, signal)) throw error;
    throw new ChatRequestError(REQUEST_ERROR);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (isAborted(error, signal)) throw error;
    throw new ChatRequestError(response.ok ? RESPONSE_ERROR : REQUEST_ERROR);
  }

  if (!response.ok) {
    const details = isRecord(payload) ? payload : {};
    const message = typeof details.error === "string" ? details.error.trim().slice(0, 300) : "";
    throw new ChatRequestError(message || REQUEST_ERROR, details.crisis === true, details.suggest === true);
  }

  if (
    !isRecord(payload) ||
    typeof payload.reply !== "string" ||
    !payload.reply.trim() ||
    typeof payload.crisis !== "boolean" ||
    typeof payload.suggest !== "boolean"
  ) {
    throw new ChatRequestError(RESPONSE_ERROR);
  }

  return { reply: payload.reply.trim(), crisis: payload.crisis, suggest: payload.suggest };
}
