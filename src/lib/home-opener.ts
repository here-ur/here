// Shared display/audio copy. No account data or server-only imports in this module.
// No generic fallback: an absent/invalid personalised opener stays silent.
export function safeHomeOpener(value?: string | null): string {
  return typeof value === "string" && value.trim() && value.length <= 100 && !/[<>\u0000-\u0008]/u.test(value)
    ? value.trim() : "";
}

/** Keep a short reply such as “아직 못 했어” grounded in the opener the user saw. */
export function withHomeOpener<T extends { role: "user" | "assistant"; content: string }>(messages: T[], opener?: string | null): (T | { role: "assistant"; content: string })[] {
  const line = safeHomeOpener(opener);
  return messages.length || !line ? messages : [{ role: "assistant", content: line.replace(/\n/g, " ") }];
}
