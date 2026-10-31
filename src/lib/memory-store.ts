import type { SupabaseClient } from "@supabase/supabase-js";
import { EMBEDDING_MODEL, MEMORY_PROMPT_VERSION, type MemoryHit, type MemoryStore } from "./memory.ts";

export function supabaseMemoryStore(client: SupabaseClient): MemoryStore {
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
      await rpc("finish_memory", { p_id: job.id, p_lease: job.lease, p_summary: summary, p_embedding: vector ? JSON.stringify(vector) : null, p_summary_model: model, p_prompt_version: MEMORY_PROMPT_VERSION }, signal);
    },
    fail: async (job, signal) => { await rpc("fail_memory", { p_id: job.id, p_lease: job.lease }, signal); },
    search: async (vector, signal) => {
      const data = await rpc("match_memories", { p_embedding: JSON.stringify(vector), p_model: EMBEDDING_MODEL }, signal);
      if (!Array.isArray(data)) throw new Error("invalid_memory_results");
      return data as MemoryHit[];
    },
  };
}
