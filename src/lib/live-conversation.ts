import type { Msg } from "./log.ts";

type Fragment = { delta: string; start_ms: number; end_ms: number };
type Segment = { role: Msg["role"]; fragments: Fragment[]; index: number };
export type LiveDelegateReply = { reply: string; crisis: boolean; suggest: boolean; sources?: import("./web-search-protocol.ts").SearchSource[] };
type Callbacks = {
  contextEnabled?(): boolean;
  prepareContext?(messages: Msg[], signal: AbortSignal): Promise<unknown>;
  contextPending?(): void;
  applyContext?(context: unknown, signal: AbortSignal): Promise<void>;
  contextFailed?(): void;
  partial(role: Msg["role"], text: string): void;
  complete(role: Msg["role"], text: string): void;
  remember(text: string, sourceId: string): void;
  delegate(messages: Msg[], signal: AbortSignal): Promise<LiveDelegateReply>;
  result(reply: LiveDelegateReply): void;
  send(event: object): void;
};

/** Live has no turn-completed event. These are UI/save chunks, not inferred final turns.
 * Preserve each fragment's timeline; user and assistant may overlap. Never use an
 * assistant acknowledgment as evidence that the user has finished speaking. */
export function liveConversation(c: Callbacks, sessionId: string) {
  const pending: Partial<Record<Msg["role"], Segment>> = {};
  const timers: Partial<Record<Msg["role"], ReturnType<typeof setTimeout>>> = {};
  const history: { role: Msg["role"]; content: string; start: number }[] = [];
  const seen = new Set<string>();
  const delegations = new Set<string>();
  let sequence = 0, revision = 0, requestCount = 0;
  let closed = false, stopping = false;
  let queued: string | undefined;
  let workTimer: ReturnType<typeof setTimeout> | undefined;
  let work: AbortController | undefined;
  let contextWork: AbortController | undefined;
  let contextTimer: ReturnType<typeof setTimeout> | undefined;
  let contextBlocked = false;
  const textOf = (segment: Segment) => segment.fragments.slice().sort((a, b) => a.start_ms - b.start_ms).map(f => f.delta).join("");
  function flush(role: Msg["role"]) {
    clearTimeout(timers[role]);
    const segment = pending[role];
    delete pending[role];
    if (!segment) return;
    const text = textOf(segment).trim();
    if (!text) return;
    c.complete(role, text);
    history.push({ role, content: text, start: Math.min(...segment.fragments.map(f => f.start_ms)) });
    if (history.length > 40) history.shift();
    if (role === "user") c.remember(text, `${sessionId}:${segment.index}`);
  }
  function context(): Msg[] {
    const entries = [...history, ...Object.values(pending).map(s => ({ role: s.role, content: textOf(s), start: s.fragments[0].start_ms }))]
      .sort((a, b) => a.start - b.start);
    // Backend expects the current user request last; don't pass the live assistant's
    // in-progress filler after it. Bound both message count and payload size.
    const lastUser = entries.findLastIndex(e => e.role === "user");
    const selected: Msg[] = [];
    let size = 0;
    for (const entry of entries.slice(0, lastUser + 1).reverse()) {
      if (!entry.content.trim()) continue;
      if (size + entry.content.length > 40_000 || selected.length >= 30) break;
      size += entry.content.length;
      selected.unshift({ role: entry.role, content: entry.content });
    }
    return selected;
  }
  function schedule() {
    clearTimeout(workTimer);
    if (closed || stopping || !queued) return;
    workTimer = setTimeout(() => { void run(); }, 150);
  }
  function scheduleContext() {
    clearTimeout(contextTimer);
    contextWork?.abort();
    if (!c.prepareContext || c.contextEnabled?.() === false || closed || stopping) return;
    // Analyse a settled transcript burst without holding up Live audio or its acknowledgments.
    contextTimer = setTimeout(async () => {
      const messages = context();
      if (!messages.length || closed || stopping) return;
      const atRevision = revision;
      const controller = new AbortController();
      contextWork = controller;
      try {
        const prepared = await c.prepareContext!(messages, controller.signal);
        if (!controller.signal.aborted && !closed && !stopping && revision === atRevision && prepared) {
          if (c.applyContext) await c.applyContext(prepared, controller.signal);
          else c.send({ type: 'session.thinking.append', delegation_id: null, content: JSON.stringify({ backend_context: prepared }) });
          if (!controller.signal.aborted && revision === atRevision) contextBlocked = false;
        }
        else if (!controller.signal.aborted && revision === atRevision && !closed && !stopping) c.contextFailed?.();
      } catch { if (!controller.signal.aborted && revision === atRevision && !closed && !stopping) c.contextFailed?.(); }
    }, 400);
  }
  async function run() {
    const id = queued;
    if (closed || stopping || !id || work) return;
    const messages = context();
    if (!messages.length) return; // Notice can arrive before transcription. Next fragment resumes it.
    queued = undefined;
    if (++requestCount > 12) {
      c.send({ type: "session.commentary.append", delegation_id: id, content: JSON.stringify({ status: "unavailable", reason: "request_limit" }) });
      return;
    }
    const atRevision = revision;
    const controller = new AbortController();
    work = controller;
    try {
      const reply = await c.delegate(messages, controller.signal);
      if (closed || stopping) return;
      if (revision !== atRevision) { queued ??= id; return; }
      c.result(reply);
      c.send({ type: "session.commentary.append", delegation_id: id, content: reply.reply });
    } catch {
      if (closed || stopping) return;
      if (revision !== atRevision) queued ??= id;
      else c.send({ type: "session.commentary.append", delegation_id: id, content: JSON.stringify({ status: "unavailable", reason: "backend_failed" }) });
    } finally { work = undefined; schedule(); }
  }
  return {
    accept(event: Record<string, unknown>) {
      if (closed) return;
      if (typeof event.event_id === "string") {
        if (seen.has(event.event_id)) return;
        seen.add(event.event_id);
        if (seen.size > 1024) seen.delete(seen.values().next().value!);
      }
      if (event.type === "session.delegation.created") {
        const d = event.delegation as { id?: string; target?: string } | undefined;
        if (d?.target !== "client" || typeof d.id !== "string" || !/^[\w-]{1,200}$/.test(d.id) || delegations.has(d.id)) return;
        delegations.add(d.id);
        if (delegations.size > 256) delegations.delete(delegations.values().next().value!);
        queued = d.id;
        schedule();
        return;
      }
      const role = event.type === "session.input_transcript.delta" ? "user" : event.type === "session.output_transcript.delta" ? "assistant" : null;
      if (!role || typeof event.delta !== "string" || !event.delta || event.delta.length > 8000
        || typeof event.start_ms !== "number" || typeof event.end_ms !== "number"
        || !Number.isFinite(event.start_ms) || !Number.isFinite(event.end_ms) || event.start_ms < 0 || event.end_ms < event.start_ms) return;
      if (role === "user") {
        revision++; work?.abort(); schedule();
        if (c.prepareContext && c.contextPending && c.contextEnabled?.() !== false) {
          if (!contextBlocked) flush('assistant');
          contextBlocked = true;
          c.contextPending();
        }
      }
      // Speech suppressed by the playback gate is not shown or saved as a heard answer.
      if (role === 'assistant' && contextBlocked) return;
      if (pending[role] && textOf(pending[role]!).length + event.delta.length > 8000) flush(role);
      pending[role] ??= { role, fragments: [], index: sequence++ };
      pending[role]!.fragments.push({ delta: event.delta, start_ms: event.start_ms, end_ms: event.end_ms });
      if (role === 'user') scheduleContext();
      c.partial(role, textOf(pending[role]!));
      clearTimeout(timers[role]);
      timers[role] = setTimeout(() => flush(role), 2500);
    },
    stopWork() { stopping = true; queued = undefined; clearTimeout(workTimer); clearTimeout(contextTimer); contextWork?.abort(); work?.abort(); },
    close() {
      if (closed) return;
      closed = true;
      clearTimeout(workTimer);
      clearTimeout(contextTimer);
      contextWork?.abort();
      work?.abort();
      flush("user"); flush("assistant");
    },
  };
}
