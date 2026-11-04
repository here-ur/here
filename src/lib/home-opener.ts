// Shared display/audio copy. No account data or server-only imports in this module.
export const FIRST_HOME_OPENER = "너와 친해지고 싶어!\n너에 대해 알려줘.";
export const DEFAULT_HOME_OPENER = "왔네!\n요즘 어떻게 지내?";
export const CASUAL_HOME_OPENERS = [
  DEFAULT_HOME_OPENER,
  "오늘 뭐 할까?\n아직 안 정했어도 괜찮아.",
  "오늘은 무슨 얘기 할까?\n별거 아닌 얘기도 좋아.",
  "갑자기 하루가 통째로 비면,\n뭐 하고 싶어?",
  "요즘 자꾸 생각나는 노래 있어?\n하나만 알려줘.",
  "오늘 먹고 싶은 거 있어?\n난 네 취향이 궁금해.",
] as const;

export function safeHomeOpener(value?: string | null): string {
  return typeof value === "string" && value.trim() && value.length <= 100 && !/[<>\u0000-\u0008]/u.test(value)
    ? value.trim() : DEFAULT_HOME_OPENER;
}

/** Keep a short reply such as “아직 못 했어” grounded in the opener the user saw. */
export function withHomeOpener<T extends { role: "user" | "assistant"; content: string }>(messages: T[], opener: string): (T | { role: "assistant"; content: string })[] {
  return messages.length ? messages : [{ role: "assistant", content: safeHomeOpener(opener).replace(/\n/g, " ") }];
}
