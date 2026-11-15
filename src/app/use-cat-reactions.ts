import { useCallback, useEffect, useRef, useState } from "react";
import { NOTICE, TAP_WINDOW_MS, tapReaction, type CatFx, type CatPose, type ReactionStep } from "@/lib/cat-poses";

/** 쉬는 자세(rest) 위에 잠깐씩 반응을 얹는다. 반응이 끝나면 다시 쉬는 자세로 돌아간다.
 * 누르기(tap)·흥미로운 걸 발견(notice)·직접 순서 재생(play)만 있고, 대화 내용은 보지 않는다. */
export function useCatReactions(rest: CatPose) {
  const [act, setAct] = useState<{ pose: CatPose; fx?: CatFx; cue: number } | null>(null);
  const timers = useRef<number[]>([]);
  const taps = useRef<number[]>([]);
  const cue = useRef(0);

  const clear = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);
  useEffect(() => clear, [clear]);

  const play = useCallback((steps: readonly ReactionStep[], after?: () => void) => {
    clear();
    let at = 0;
    for (const [pose, ms, fx] of steps) {
      timers.current.push(window.setTimeout(() => setAct({ pose, fx, cue: ++cue.current }), at));
      at += ms;
    }
    timers.current.push(window.setTimeout(() => { setAct(null); after?.(); }, at));
  }, [clear]);

  const tap = useCallback(() => {
    const now = Date.now();
    taps.current = taps.current.filter((t) => now - t < TAP_WINDOW_MS).concat(now);
    const steps = tapReaction(rest, taps.current.length);
    if (steps[0][0] === "hiss") taps.current = [];
    play(steps);
  }, [rest, play]);

  const notice = useCallback(() => play(NOTICE), [play]);
  const reset = useCallback(() => { clear(); setAct(null); }, [clear]);

  return { pose: act?.pose ?? rest, fx: act?.fx, cue: act?.cue ?? 0, busy: act !== null, tap, notice, play, reset };
}
