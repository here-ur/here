"use client";

import { useEffect, useRef, useState } from "react";
import { waitForCatYawn } from "@/lib/cat-yawn";
import CatArtwork from "../../CatArtwork";
import { Button } from "../../ui/Button";
import "./yawn-preview.css";

/** Uses the same face animation and timing as the home voice button, without microphone access. */
export default function YawnPreview() {
  const [playing, setPlaying] = useState(false);
  const [pose, setPose] = useState<number | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  function inspect(value: number | null) {
    request.current?.abort(); request.current = null; setPlaying(false); setPose(value);
  }

  async function play() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPose(null);
    setPlaying(true);
    try {
      await waitForCatYawn(controller.signal, matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch { /* Moving the pose slider or leaving the preview cancels playback. */ }
    finally { if (request.current === controller) { request.current = null; setPlaying(false); } }
  }

  return <section id="yawn" className="yawn-preview mt-6 rounded-r5 bg-white/70 p-4">
    <h2 className="text-t4 font-bold">음성 시작 하품</h2>
    <p className="mt-1 text-t3 text-cat-muted">몸은 가만히 두고 눈·입·고개만 움직여요. 2.4초 후 원래 표정으로 돌아와요.</p>
    <div className="mt-3 flex gap-2">
      <Button variant="plain" className="min-h-10 rounded-r3 bg-white px-3" onClick={() => inspect(null)}>기본 자세</Button>
      <Button variant="plain" className="min-h-10 rounded-r3 bg-white px-3" onClick={() => inspect(0)}>시작 프레임</Button>
      <Button variant="plain" className="min-h-10 rounded-r3 bg-white px-3" onClick={() => inspect(60)}>하품 정점</Button>
    </div>
    <div className="yawn-preview-art"><CatArtwork state={playing || pose !== null ? "yawning" : "idle"} progress={pose === null ? undefined : pose / 100} /></div>
    <Button onClick={() => void play()} disabled={playing} fullWidth>{playing ? "하품하는 중…" : "하품 재생"}</Button>
    <label className="mt-4 flex flex-col gap-2 text-t3">
      표정 자세히 보기
      <input aria-label="하품 진행률" type="range" min="0" max="100" value={pose ?? 0} onChange={(event) => inspect(Number(event.target.value))} />
    </label>
  </section>;
}
