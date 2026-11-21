import { connectLive, type LiveConnection } from './live.ts';
import type { Handlers } from './realtime.ts';

const quiet: Handlers = {
  onStatus() {}, onError() {}, onUserPartial() {}, onUserText() {},
  onAssistantPartial() {}, onAssistantText() {}, onTool() {},
};

/** One authenticated, silent session. No retry loop or microphone access. */
export function prepareLiveSession(getToken: () => Promise<string>) {
  const controller = new AbortController();
  let claimed = false;
  let connection: LiveConnection | undefined;
  const ready = (async () => {
    const token = await getToken();
    controller.signal.throwIfAborted();
    connection = await connectLive(quiet, {}, controller.signal, token, { standby: true, historyManaged: true });
    return connection;
  })();
  void ready.catch(() => {});
  return {
    dispose() { if (!claimed) { controller.abort(); connection?.close(); } },
    async claim(handlers: Handlers, startedAt: number, token: string, signal: AbortSignal) {
      if (claimed) throw Error('voice_session_already_claimed');
      claimed = true;
      const abort = () => controller.abort();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      try {
        const value = await ready;
        signal.throwIfAborted();
        await value.activate(handlers, startedAt, token);
        signal.throwIfAborted();
        return value;
      } catch (error) {
        controller.abort(); connection?.close();
        signal.removeEventListener('abort', abort);
        throw error;
      }
    },
  };
}
