/** Visual-only tap of the remote audio. Never connects to speakers or reads the microphone. */
export function speechEnvelope(samples: Float32Array, previous: number, elapsedMs: number): number {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const rms = Math.sqrt(energy / Math.max(1, samples.length));
  const target = rms <= 0.008 ? 0 : Math.min(1, Math.pow((rms - 0.008) / 0.16, 0.65));
  const smooth = 1 - Math.exp(-Math.min(100, Math.max(0, elapsedMs)) / (target > previous ? 28 : 65));
  const next = previous + (target - previous) * smooth;
  return next < 0.015 ? 0 : next;
}

export function createOutputAudioMeter(onLevel: (level: number) => void) {
  let context: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let analyser: AnalyserNode | undefined;
  let audio: HTMLAudioElement | undefined;
  let frame = 0;
  let level = 0;
  let last = 0;
  let enabled = false;
  let closed = false;
  const reset = () => { level = 0; onLevel(0); };
  const resume = () => {
    if (!closed && context?.state === "suspended") void context.resume().catch(() => {});
  };
  try {
    if (typeof AudioContext !== "undefined") context = new AudioContext();
  } catch { /* Visual analysis must never prevent a voice call. */ }
  const hasDocument = typeof document !== "undefined";
  const visibility = () => { if (document.hidden) reset(); else resume(); };
  if (context && hasDocument) {
    document.addEventListener("pointerdown", resume);
    document.addEventListener("keydown", resume);
    document.addEventListener("visibilitychange", visibility);
  }
  resume();
  return {
    attach(stream: MediaStream, element: HTMLAudioElement) {
      if (closed || !context) return;
      cancelAnimationFrame(frame);
      source?.disconnect();
      analyser?.disconnect();
      reset();
      audio = element;
      try {
        analyser = context.createAnalyser();
        analyser.fftSize = 512;
        source = context.createMediaStreamSource(stream);
        source.connect(analyser);
        // No destination connection: the existing audio element remains the only speaker output.
        const samples = new Float32Array(analyser.fftSize);
        last = 0;
        const tick = (time: number) => {
          if (closed) return;
          const elapsed = last ? time - last : 16;
          last = time;
          if (enabled && context?.state === "running" && !document.hidden && !audio?.paused && !audio?.muted && audio?.volume !== 0) {
            analyser!.getFloatTimeDomainData(samples);
            level = speechEnvelope(samples, level, elapsed);
            onLevel(level);
          } else if (level) reset();
          frame = requestAnimationFrame(tick);
        };
        resume();
        frame = requestAnimationFrame(tick);
      } catch { reset(); }
    },
    setEnabled(value: boolean) { enabled = value; if (!value) reset(); else resume(); },
    reset,
    close() {
      if (closed) return;
      closed = true;
      if (frame) cancelAnimationFrame(frame);
      source?.disconnect();
      analyser?.disconnect();
      if (hasDocument) {
        document.removeEventListener("pointerdown", resume);
        document.removeEventListener("keydown", resume);
        document.removeEventListener("visibilitychange", visibility);
      }
      if (context) void context.close().catch(() => {});
      reset();
    },
  };
}
