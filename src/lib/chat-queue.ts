import type { Msg } from "./log.ts";
import type { HistoryMessage } from "./conversation-history.ts";

/** One reply at a time; messages sent while waiting form the next turn. */
export class ChatQueue<T> {
  private pending: T[] = [];
  private running = false;
  private stopped = false;
  private failed = false;
  private controller: AbortController | null = null;

  private callbacks: {
    run: (messages: T[], signal: AbortSignal) => Promise<void>;
    state: (busy: boolean, failed: boolean) => void;
    error: (error: unknown) => void;
  };
  private batchSize: number;

  constructor(callbacks: ChatQueue<T>["callbacks"], batchSize = 20) {
    this.callbacks = callbacks;
    this.batchSize = batchSize;
  }

  enqueue(message: T) {
    if (this.stopped) return;
    this.pending.push(message);
    this.retry();
  }

  retry() {
    if (this.stopped || this.running || !this.pending.length) return;
    this.failed = false;
    void this.drain();
  }

  cancel() {
    this.stopped = true;
    this.pending = [];
    this.controller?.abort();
    this.callbacks.state(false, false);
  }

  private async drain() {
    this.running = true;
    this.callbacks.state(true, false);
    try {
      while (!this.stopped && this.pending.length) {
        const batch = this.pending.splice(0, this.batchSize);
        this.controller = new AbortController();
        try { await this.callbacks.run(batch, this.controller.signal); }
        catch (error) {
          if (this.stopped) return;
          this.pending.unshift(...batch);
          this.failed = true;
          this.callbacks.error(error);
          break; // Explicit retry/new message, never an automatic error loop.
        }
      }
    } finally {
      this.running = false;
      this.controller = null;
      if (!this.stopped) this.callbacks.state(false, this.failed);
    }
  }
}

/** Snapshot a turn without including messages waiting for a later batch. */
export function queuedChatContext(all: Msg[], batch: HistoryMessage[]): Msg[] {
  const ids = new Set(batch.map(m => m.id));
  const lastAt = batch.at(-1)!.at;
  const previous = all.filter(m => !ids.has(m.id ?? "") && (m.role === "assistant" || (m.at ?? 0) <= lastAt));
  const context = [...previous, ...batch].slice(-60);
  while (context.length > batch.length && context.reduce((sum, m) => sum + m.content.length, 0) > 60000) context.shift();
  return context;
}
