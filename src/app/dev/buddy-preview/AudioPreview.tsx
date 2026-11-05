"use client";
import { useEffect, useRef, useState } from "react";
import { createOutputAudioMeter } from "@/lib/output-audio-meter";
import Buddy from "../../Buddy";

/** A real speech waveform -> MediaStream -> the same meter as WebRTC, including audible pauses. */
export default function AudioPreview() {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const level = useRef(0);
  const stop = useRef<() => void>(() => {});
  const output = useRef<HTMLAudioElement | null>(null);
  const metrics = useRef<HTMLOutputElement>(null);
  useEffect(() => () => stop.current(), []);
  const play = async () => {
    stop.current();
    setError("");
    const context = new AudioContext();
    const sourceAudio = new Audio("/dev/buddy-preview/speech");
    const destination = context.createMediaStreamDestination();
    const source = context.createMediaElementSource(sourceAudio);
    source.connect(destination);
    const audible = new Audio();
    audible.srcObject = destination.stream;
    output.current = audible;
    let audibleFrames = 0, silentFrames = 0, peak = 0;
    const meter = createOutputAudioMeter(value => {
      level.current = value;
      if (value > .015) audibleFrames++; else silentFrames++;
      peak = Math.max(peak, value);
      if (metrics.current) metrics.current.textContent = `음성 프레임 ${audibleFrames} · 무음 프레임 ${silentFrames} · 최대 벌림 ${peak.toFixed(2)} · 현재 ${value.toFixed(2)}`;
    });
    meter.attach(destination.stream, audible);
    meter.setEnabled(true);
    stop.current = () => {
      meter.close(); sourceAudio.pause(); audible.pause(); audible.srcObject = null;
      source.disconnect(); destination.stream.getTracks().forEach(track => track.stop());
      void context.close().catch(() => {}); level.current = 0; setPlaying(false);
    };
    sourceAudio.onended = () => stop.current();
    setMuted(false);
    try { await context.resume(); await Promise.all([audible.play(), sourceAudio.play()]); setPlaying(true); }
    catch { stop.current(); setError("샘플을 재생하지 못했어요."); }
  };
  return <section className="mt-8">
    <h2 className="text-t4 font-bold">실제 음성 파형 확인</h2>
    <p className="text-t3 text-cat-muted">합성 한국어 샘플. 문장 사이 무음에서 입이 닫히는지 확인해요.</p>
    <div className="flex justify-center"><Buddy size={220} state={playing ? "speaking" : "idle"} outputLevel={level} /></div>
    <div className="flex flex-wrap gap-2">
      <button className="ui-press rounded-full bg-white px-4 py-3" onClick={() => void play()}>음성 샘플 재생</button>
      <button className="ui-press rounded-full bg-white px-4 py-3" disabled={!playing} onClick={() => { if (output.current) { output.current.muted = !muted; if (!muted) level.current = 0; } setMuted(!muted); }}>{muted ? "소리 켜기" : "음소거"}</button>
      <button className="ui-press rounded-full bg-white px-4 py-3" onClick={() => stop.current()}>샘플 종료</button>
    </div>
    <output ref={metrics} aria-label="음성 파형 검증 결과" className="mt-2 block text-t2 text-cat-muted">재생 전</output>
    {error && <p role="alert">{error}</p>}
  </section>;
}
