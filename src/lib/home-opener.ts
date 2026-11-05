// Shared display/audio copy. No account data or server-only imports in this module.
export const FIRST_HOME_OPENER = "네가 새 집사야?\n일단 얘기 좀 해 봐.";
export const DEFAULT_HOME_OPENER = "왔어?\n오늘은 무슨 일인데.";
export const CASUAL_HOME_OPENERS = [
  DEFAULT_HOME_OPENER,
  "할 말 있어?\n웅. 듣고 있어.",
  "오늘은 뭐 했어?\n별일 없었어도 말해 봐.",
  "그냥 들렀어?\n뭐, 그래도 되고.",
  "요즘 뭐에 꽂혔어?\n나도 좀 알자.",
  "무슨 생각 해?\n혼자만 하지 말고 얘기 좀 해 봐.",
] as const;

export function safeHomeOpener(value?: string | null): string {
  return typeof value === "string" && value.trim() && value.length <= 100 && !/[<>\u0000-\u0008]/u.test(value)
    ? value.trim() : DEFAULT_HOME_OPENER;
}

/** Keep a short reply such as “아직 못 했어” grounded in the opener the user saw. */
export function withHomeOpener<T extends { role: "user" | "assistant"; content: string }>(messages: T[], opener: string): (T | { role: "assistant"; content: string })[] {
  return messages.length ? messages : [{ role: "assistant", content: safeHomeOpener(opener).replace(/\n/g, " ") }];
}
