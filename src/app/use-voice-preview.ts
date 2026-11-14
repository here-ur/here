"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { estimateMouthShape, type MouthShape } from "@/lib/mouth-shape";

// 목소리 미리듣기. public/voices/{id}.mp3(같은 문장을 각 목소리로 미리 만들어 둔 짧은 파일)를 재생하고,
// 실제 음성 대화와 같은 입 모양 추정에 소리를 흘려 몽글이 입이 맞춰 움직이게 한다.
// 서버나 AI를 부르지 않고, 사용자가 목소리를 고를 때만 재생한다.
export function useVoicePreview() {
  const [playing, setPlaying] = useState<string | null>(null);
  const level = useRef(0);
  const shape = useRef<MouthShape>("rest");
  const graph = useRef<{ ac: AudioContext; analyser: AnalyserNode } | null>(null);
  const current = useRef<{ audio: HTMLAudioElement; source: MediaElementAudioSourceNode } | null>(null);
  const frame = useRef(0);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const now = current.current;
    current.current = null;
    if (now) {
      now.audio.onended = null;
      now.audio.pause();
      now.source.disconnect();
    }
    level.current = 0;
    shape.current = "rest";
    setPlaying(null);
  }, []);

  const play = useCallback(async (voice: string) => {
    stop();
    try {
      if (!graph.current) {
        const ac = new AudioContext();
        const analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        analyser.connect(ac.destination);
        graph.current = { ac, analyser };
      }
      const { ac, analyser } = graph.current;
      const audio = new Audio(`/voices/${voice}.mp3`);
      const source = ac.createMediaElementSource(audio);
      source.connect(analyser);
      current.current = { audio, source };
      audio.onended = stop;
      await ac.resume();
      await audio.play();
      if (current.current?.audio !== audio) return; // 그새 다른 목소리를 골랐다
      setPlaying(voice);
      const wave = new Float32Array(analyser.fftSize);
      const spectrum = new Float32Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getFloatTimeDomainData(wave);
        analyser.getFloatFrequencyData(spectrum);
        const rms = Math.sqrt(wave.reduce((sum, v) => sum + v * v, 0) / wave.length);
        level.current = Math.min(1, rms * 6);
        shape.current = estimateMouthShape(spectrum, ac.sampleRate, analyser.fftSize, level.current);
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch {
      stop();
    }
  }, [stop]);

  useEffect(() => () => {
    stop();
    void graph.current?.ac.close().catch(() => {});
    graph.current = null;
  }, [stop]);

  return { play, stop, playing, level, shape };
}
