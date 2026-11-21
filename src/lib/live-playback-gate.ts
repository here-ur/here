/** Mute the live media stream while fetching context; keep it playing so stale audio is discarded.
 * An append acknowledgment alone does not release playback. Observe a quiet media boundary first. */
export function livePlaybackGate(deps: {
  mute(blocked: boolean): void;
  instruction(text: string): void;
  append(context: unknown, signal: AbortSignal): Promise<void>;
}, now = () => performance.now()) {
  let blocked = false, generation = 0, observed = false, quietSince = 0;
  const waiters = new Set<() => void>();
  return {
    begin() {
      generation++;
      if (!blocked) {
        blocked = true;
        deps.mute(true);
        deps.instruction('사용자 맥락을 조회하는 동안 말하지 말고 기다리세요.');
      }
      for (const wake of waiters) wake();
    },
    observe(active: boolean) {
      if (!observed || active) quietSince = now();
      observed = true;
      for (const wake of waiters) wake();
    },
    async apply(context: unknown, requestSignal: AbortSignal) {
      const version = generation;
      const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(8000)]);
      await deps.append(context, signal);
      signal.throwIfAborted();
      if (version !== generation) throw Error('superseded_context');
      // Require fresh quiet samples after delivery; buffered speech never becomes a valid answer.
      observed = false;
      quietSince = now();
      await new Promise<void>((resolve, reject) => {
        const done = (error?: Error) => { waiters.delete(check); signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(); };
        const abort = () => done(Error('context_cancelled'));
        const check = () => {
          if (version !== generation) done(Error('superseded_context'));
          else if (observed && now() - quietSince >= 250) done();
        };
        waiters.add(check);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
      signal.throwIfAborted();
      if (version !== generation) throw Error('superseded_context');
      deps.instruction('지금 전달된 최신 사용자 맥락을 바탕으로 마지막 사용자 발언에 답하세요.');
      blocked = false;
      deps.mute(false);
    },
    close() { generation++; blocked = true; deps.mute(true); for (const wake of waiters) wake(); },
  };
}
