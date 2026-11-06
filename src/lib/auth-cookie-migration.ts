import { createChunks, DEFAULT_COOKIE_OPTIONS, isChunkLike, parseCookieHeader, serializeCookieHeader, stringToBase64URL } from "@supabase/ssr";

// One-way migration; never resurrect an old local token after a cookie logout.
export function migrateAuthCookie(url: string, document: Pick<Document, "cookie">, storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, secure: boolean) {
  const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const marker = `${key}-cookie-migrated`;
  try {
    if (storage.getItem(marker)) return;
    const cookies = parseCookieHeader(document.cookie);
    if (!cookies.some(c => isChunkLike(c.name, key))) {
      const raw = storage.getItem(key);
      if (!raw) return;
      const session = JSON.parse(raw);
      if (!session?.access_token || !session?.refresh_token) return;
      const chunks = createChunks(key, `base64-${stringToBase64URL(raw)}`);
      for (const chunk of chunks) document.cookie = serializeCookieHeader(chunk.name, chunk.value, { ...DEFAULT_COOKIE_OPTIONS, secure });
      const written = parseCookieHeader(document.cookie);
      if (!chunks.every(c => written.some(w => w.name === c.name && w.value === c.value))) throw Error("cookie_unavailable");
    }
    storage.setItem(marker, "1");
    storage.removeItem(key);
  } catch {
    // Leave legacy storage intact if the browser refuses persistence.
  }
}
