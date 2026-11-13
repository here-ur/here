"use client";
import { useEffect, useRef, useState } from "react";
import { estimateMouthShape, type MouthShape } from "@/lib/mouth-shape";
import Buddy from "../../Buddy";
import { MEOWS, playMeow, type MeowKind } from "./meow";

// 처음 홈 진입 '냐옹' 시안을 들어 보는 칸. 팀 결정 전이라 실제 홈에는 없다.
// 소리에 맞춰 몽글이 입이 움직이도록, 실제 음성과 같은 입 모양 추정(estimateMouthShape)에 소리를 흘려 본다.
export default function MeowPreview() {
  const [playing, setPlaying] = useState<MeowKind | null>(null);
  const [quiet, setQuiet] = useState(true);
  const [error, setError] = useState("");
  const level = useRef(0);
  const shape = useRef<MouthShape>("rest");
  const audio = useRef<{ ac: AudioContext; analyser: AnalyserNode } | null>(null);
  const frame = useRef(0);

  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    void audio.current?.ac.close().catch(() => {});
  }, []);

  const play = async (kind: MeowKind) => {
    setError("");
    try {
      if (!audio.current) {
        const ac = new AudioContext();
        const analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        analyser.connect(ac.destination);
        audio.current = { ac, analyser };
      }
      const { ac, analyser } = audio.current;
      await ac.resume();
      const duration = playMeow(ac, kind, { volume: quiet ? 0.5 : 1, destination: analyser });
      setPlaying(kind);

      cancelAnimationFrame(frame.current);
      const wave = new Float32Array(analyser.fftSize);
      const spectrum = new Float32Array(analyser.frequencyBinCount);
      const until = ac.currentTime + duration + 0.15; // 오디오 시계 기준으로 소리가 끝날 때까지 입을 움직인다
      const tick = () => {
        analyser.getFloatTimeDomainData(wave);
        analyser.getFloatFrequencyData(spectrum);
        const rms = Math.sqrt(wave.reduce((sum, v) => sum + v * v, 0) / wave.length);
        level.current = Math.min(1, rms * (quiet ? 16 : 8));
        shape.current = estimateMouthShape(spectrum, ac.sampleRate, analyser.fftSize, level.current);
        if (ac.currentTime < until) frame.current = requestAnimationFrame(tick);
        else { level.current = 0; shape.current = "rest"; setPlaying(null); }
      };
      frame.current = requestAnimationFrame(tick);
    } catch {
      setError("소리를 재생하지 못했어요.");
      setPlaying(null);
    }
  };

  return (
    <section className="mt-8 rounded-r5 bg-white/70 p-4">
      <h2 className="text-t4 font-bold">처음 홈 진입 냐옹 (시안)</h2>
      <p className="mt-1 text-t3 text-pretty text-cat-muted">
        팀 결정 전이라 실제 홈에는 없어요. 소리 파일 없이 만든 소리라 실제 고양이보다 기계적으로 들려요. 넣기로 하면 녹음 파일로 바꾸고, 온보딩 직후 한 번만, 효과음 설정을 따라 울리게 할 생각이에요.
      </p>
      <div className="mt-3 flex justify-center">
        <Buddy size={200} state={playing ? "speaking" : "idle"} outputLevel={level} outputShape={shape} />
      </div>
      <div className="mt-3 grid gap-2">
        {(Object.keys(MEOWS) as MeowKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            data-sfx="none"
            onClick={() => void play(kind)}
            aria-pressed={playing === kind}
            className={`ui-press flex min-h-12 items-center justify-between rounded-r4 px-4 text-left ${playing === kind ? "bg-cat-ink text-white" : "bg-white text-cat-ink"}`}
          >
            <span className="text-t5 font-bold">{MEOWS[kind].label}</span>
            <span className={`text-t2 ${playing === kind ? "text-white/80" : "text-cat-muted"}`}>{MEOWS[kind].note} · {MEOWS[kind].duration}초</span>
          </button>
        ))}
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-2 text-t3">
        <input type="checkbox" checked={quiet} onChange={(event) => setQuiet(event.target.checked)} className="size-5" />
        작게 (실제로 넣을 때 추천하는 크기)
      </label>
      {error && <p role="alert" className="mt-2 text-t3 text-[#C42A23]">{error}</p>}
    </section>
  );
}
