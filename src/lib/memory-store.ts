import type { SupabaseClient } from "@supabase/supabase-js";
import { EMBEDDING_MODEL, MEMORY_PROMPT_VERSION, type MemoryHit, type MemoryStore } from "./memory.ts";
import type { UserCipher } from "./conversation-cipher.ts";

// 요약은 암호화해서 저장하고, 검색 결과는 복호화해서 돌려준다. cipher는 요청한 사용자 기준이다.
export function supabaseMemoryStore(client: SupabaseClient, cipher: UserCipher): MemoryStore {
  async function rpc(name: string, args: Record<string, unknown>, signal: AbortSignal) {
    const { data, error } = await client.rpc(name, args).abortSignal(signal);
    if (error) throw new Error("memory_database_failed");
    return data;
  }
  return {
    enabled: async signal => (await rpc("memory_is_enabled", {}, signal)) === true,
    claim: async (key, signal) => {
      const data = await rpc("claim_memory", { p_key: key }, signal);
      return data && typeof data.id === "string" && typeof data.lease === "string" ? data : null;
    },
    finish: async (job, summary, vector, model, signal) => {
      const encrypted = cipher.encryptSummary("conversation_memories", summary);
      const saved = await rpc("finish_memory", { p_id: job.id, p_lease: job.lease, p_summary: encrypted.value, p_embedding: vector ? JSON.stringify(vector) : null, p_summary_model: model, p_prompt_version: MEMORY_PROMPT_VERSION, p_summary_key_version: encrypted.keyVersion }, signal);
      if (saved !== true) throw new Error("memory_save_rejected");
    },
    fail: async (job, signal) => { await rpc("fail_memory", { p_id: job.id, p_lease: job.lease }, signal); },
    search: async (vector, signal) => {
      const data = await rpc("match_memories", { p_embedding: JSON.stringify(vector), p_model: EMBEDDING_MODEL }, signal);
      if (!Array.isArray(data)) throw new Error("invalid_memory_results");
      return (data as (MemoryHit & { summary_key_version: number })[]).map(({ summary_key_version, ...hit }) =>
        ({ ...hit, summary: cipher.decryptSummary("conversation_memories", hit.summary, summary_key_version ?? 0) }));
    },
  };
}
