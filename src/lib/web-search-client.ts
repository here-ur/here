import { SEARCH_UNAVAILABLE, safeSearchSource, type WebSearchResult, type SearchSource } from "./web-search-protocol.ts";
import { VoiceMemoryAccessError } from "./voice-memory-client.ts";

export async function requestWebSearch(query: string, token: string, signal: AbortSignal): Promise<WebSearchResult> {
  const response = await fetch("/api/web-search", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }), signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
  });
  if (response.status === 401 || response.status === 403) throw new VoiceMemoryAccessError("search_access_denied");
  if (!response.ok) return SEARCH_UNAVAILABLE;
  const body = await response.json();
  if (body.available !== true || typeof body.text !== "string" || body.text.length > 6000 || !Array.isArray(body.sources)) return SEARCH_UNAVAILABLE;
  const sources = body.sources.slice(0, 5).map(safeSearchSource).filter((s: SearchSource | null): s is SearchSource => Boolean(s));
  return sources.length ? { available: true, text: body.text, sources } : SEARCH_UNAVAILABLE;
}
