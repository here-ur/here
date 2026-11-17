import { ChatRequestError } from "./chat.ts";
import { HISTORY_DAYS, isUuid, mergeHistory, type HistoryMessage } from "./conversation-history.ts";
import type { Msg } from "./log.ts";

/** Restore account history before answering, even while the UI history is loading.
 * Do not cache it globally: each request uses the current account's access token. */
export async function loadRecentChatHistory(accessToken: string, signal: AbortSignal): Promise<HistoryMessage[]> {
  try {
    const response = await fetch("/api/conversations", {
      headers: { Authorization: `Bearer ${accessToken}` }, credentials: "same-origin", cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    });
    if (!response.ok) throw new Error("history_unavailable");
    const body = await response.json();
    if (!Array.isArray(body.messages) || body.messages.length > 30) throw new Error("invalid_history");
    const now = Date.now();
    if (!body.messages.every((m: HistoryMessage) => m && isUuid(m.id)
      && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
      && m.content.length > 0 && m.content.length <= 8000 && Number.isFinite(m.at))) throw new Error("invalid_history");
    return body.messages.filter((m: HistoryMessage) => m.at > now - HISTORY_DAYS * 86400000);
  } catch (error) {
    if (signal.aborted) throw error;
    // Never silently answer without the conversation the user sees above.
    throw new ChatRequestError("최근 대화를 불러오지 못했어요. 맥락을 이어가려면 답변 다시 받기를 눌러 주세요.");
  }
}

export function mergeChatHistory(saved: HistoryMessage[], current: Msg[]): Msg[] {
  const identified = current.filter((m): m is HistoryMessage => Boolean(m.id) && typeof m.at === "number");
  // A home opener has no ID; keep it without duplicating persisted exchanges.
  return [...current.filter(m => !m.id), ...mergeHistory(saved, identified)];
}
