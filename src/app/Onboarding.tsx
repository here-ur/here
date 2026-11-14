"use client";

import List from "framework7-react/components/list.js";
import ListItem from "framework7-react/components/list-item.js";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./art";
import Buddy from "./Buddy";
import { CatRings, Cushion, FirstRunFooter, FirstRunHeading, FirstRunScreen, FirstRunTopBar, FrontTree, SoundToggle, StreetLand } from "./FirstRun";
import PoseCat from "./PoseCat";
import { useCatReactions } from "./use-cat-reactions";
import type { CatPose } from "@/lib/cat-poses";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { useVoicePreview } from "./use-voice-preview";
import {
  COLORS,
  DEFAULT_COMPANION,
  QUESTIONS,
  VOICES,
  type Answers,
  type ColorId,
  type Profile,
  type ShapeId,
  type VoiceId,
  cleanName,
  describeStyle,
  josa,
  matchStyle,
} from "@/lib/onboarding";
import * as sfx from "@/lib/sound";

// 첫 실행의 '캐릭터 만나기'. 길고양이 이야기: 길 위에서 나무 뒤의 고양이를 발견하고(질문 두 개),
// 대답할수록 다가오고, 꾹 눌러 데려가고, 문을 지나 집 안에서 앉을 자리·목소리·이름을 정한다.
// 큰 글씨는 고양이의 말, 작은 글씨는 서비스가 덧붙이는 속마음이다. 안내·질문·109는 고양이 말투를 쓰지 않는다.
type Step = "name" | "safety" | "q1" | "q2" | "meet" | "adopt" | "door" | "spot" | "voice" | "naming";
const ORDER: Step[] = ["name", "safety", "q1", "q2", "meet", "adopt", "door", "spot", "voice", "naming"];

const HOLD_MS = 1400;
const LEAVE_MS = 150;
const RING = 2 * Math.PI * 44;

export default function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [step, setStep] = useState<Step>("name");
  const [nickname, setNickname] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const shape: ShapeId = "cloud"; // Legacy profile value; the character is now a cat.
  const [color, setColor] = useState<ColorId>("lavender");
  const [voice, setVoice] = useState<VoiceId>("marin");
  const [companion, setCompanion] = useState(DEFAULT_COMPANION);
  const [muted, setMuted] = useState(false);
  const [holding, setHolding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRiser = useRef<() => void>(() => {});
  const [soundStarted, setSoundStarted] = useState(false);
  const advancing = useRef(false);
  const preview = useVoicePreview();
  const stopPreview = preview.stop;

  useEffect(() => () => sfx.stopPad(), []);
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

  const name = nickname.trim() || "친구";
  const style = matchStyle(answers);
  const companionName = cleanName(companion);
  const swatch = COLORS.find((c) => c.id === color)!;
  const voiceInfo = VOICES.find((v) => v.id === voice)!;

  // 장면마다 고양이가 쉬는 자세. 누르기·고르기에 잠깐 반응하고 다시 이 자세로 돌아간다(목소리 장면은 입 모양 때문에 Buddy를 그대로 쓴다).
  const rest: CatPose = step === "name" ? (nickname.trim() ? "glare" : "sleep")
    : step === "q1" ? "groom" : step === "q2" ? "glare"
      : step === "adopt" ? (holding ? "ready" : "base")
        : step === "spot" ? "sleep" : step === "naming" ? "purr" : "base";
  const cat = useCatReactions(rest);
  const catPose = <PoseCat pose={cat.pose} fx={cat.fx} cue={cat.cue} />;
  const tappableCat = (place: string) => (
    <div className={`fr-cat ${place}`}>
      <button type="button" className="fr-cat-tap" onClick={cat.tap} aria-label="고양이 건드려 보기">{catPose}</button>
    </div>
  );

  // 화면 전환: 지금 화면이 잠깐 흐려지며 사라지고(LEAVE_MS), 다음 화면이 위로 살짝 떠오르며 나타난다.
  function go(next: Step, sound = true) {
    if (leaving) return;
    advancing.current = false;
    cat.reset();
    if (sound) sfx.tick();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(next);
      return;
    }
    setLeaving(true);
    setTimeout(() => {
      setStep(next);
      setLeaving(false);
    }, LEAVE_MS);
  }

  function back() {
    const i = ORDER.indexOf(step);
    if (i <= 0) return;
    stopPreview();
    go(ORDER[i - 1]);
  }

  // 배경 소리는 첫 버튼을 누른 뒤에만 켤 수 있다(브라우저 자동 재생 제한).
  function startSound() {
    if (soundStarted) return;
    setSoundStarted(true);
    sfx.unlock();
    sfx.startPad();
  }

  function toggleSound() {
    setMuted(!muted);
    sfx.setMuted(!muted);
    if (!muted) stopPreview();
  }

  function answer(id: (typeof QUESTIONS)[number]["id"], value: string, i: number, next: Step) {
    if (advancing.current) return;
    advancing.current = true;
    sfx.pick(i);
    setAnswers((current) => ({ ...current, [id]: value }));
    cat.notice(); // 고른 답에 고양이가 눈을 동그랗게 뜨고 갸웃한다(흥미로운 걸 발견)
    setTimeout(() => go(next, false), 800); // 고른 답과 고양이 반응이 잠깐 보이게
  }

  function holdStart() {
    setHolding(true);
    sfx.buzz(20);
    stopRiser.current = sfx.riser(HOLD_MS);
    holdTimer.current = setTimeout(adopt, HOLD_MS);
  }

  function holdEnd() {
    if (!holdTimer.current) return;
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
    stopRiser.current();
    setHolding(false);
  }

  function adopt() {
    holdTimer.current = null;
    stopRiser.current();
    sfx.buzz([40, 60, 120]);
    sfx.burst();
    setHolding(false);
    cat.play([["swat", 1000, "hop"]], () => go("door", false)); // 앞발로 툭 치고 따라온다
  }

  function pickVoice(id: VoiceId, i: number) {
    sfx.pick(i);
    setVoice(id);
    if (muted) return;
    sfx.stopPad(); // 목소리를 들을 때는 배경 소리를 끈다
    void preview.play(id);
  }

  function finish() {
    stopPreview();
    sfx.stopPad();
    onDone({ nickname: nickname.trim(), companion: companionName, shape, color, voice, style });
  }

  // 나갈 때는 짧게 흐려지고, 들어올 때는 위에서부터 차례로 떠오른다. 동작 줄이기를 켜면 바로 바뀐다.
  const motion = leaving
    ? "motion-safe:animate-screen-out"
    : "motion-safe:[&>*]:animate-screen-in [&>*:nth-child(2)]:[animation-delay:60ms] [&>*:nth-child(3)]:[animation-delay:120ms] [&>*:nth-child(4)]:[animation-delay:180ms] [&>*:nth-child(n+5)]:[animation-delay:240ms]";
  const sound = soundStarted ? <SoundToggle muted={muted} onToggle={toggleSound} /> : undefined;
  const top = <FirstRunTopBar onBack={step === "name" ? undefined : back} end={sound} />;
  const next = (to: Step, label = "다음") => <FirstRunFooter><Button tone="ink" fullWidth onClick={() => go(to)}>{label}</Button></FirstRunFooter>;

  switch (step) {
    case "name":
      return (
        <FirstRunScreen key={step} tone="cream" className={motion}>
          {top}
          {/* 길 위에서 웅크려 자다가, 글자를 치면 실눈 뜨고 째려보고, 이름을 정하면 하품하고 넘어간다 */}
          <div className="fr-name-cat">
            <button type="button" className="fr-cat-tap" onClick={cat.tap} aria-label="고양이 건드려 보기">{catPose}</button>
          </div>
          <FirstRunHeading title="뭐라고 부르면 될까요?" description={`${josa(DEFAULT_COMPANION, "이", "가")} 이 이름으로 불러요.`} />
          {/* 약관 동의는 첫 환영 화면의 체크로 옮겼다. */}
          <form className="contents" onSubmit={(e) => {
            e.preventDefault();
            if (!nickname.trim() || advancing.current) return;
            advancing.current = true;
            startSound();
            cat.play([["yawn", 1100]], () => go("safety"));
          }}>
            <div className="fr-field mt-9">
              <TextField label="이름이나 별명" hideLabel variant="plain" id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)}
                maxLength={12} placeholder="이름이나 별명" autoComplete="nickname" enterKeyHint="next" inputClassName="fr-input" />
            </div>
            <FirstRunFooter><Button type="submit" tone="ink" fullWidth disabled={!nickname.trim()}>다음</Button></FirstRunFooter>
          </form>
        </FirstRunScreen>
      );

    case "safety":
      return (
        <FirstRunScreen key={step} tone="cream" className={motion} scroll>
          {top}
          <FirstRunHeading eyebrow={`반가워요, ${name}님`} title="시작하기 전에 세 가지만요" className="mt-4" />
          <List strong inset dividersIos className="fr-list mx-5 mt-7">
            <ListItem title={`${josa(DEFAULT_COMPANION, "은", "는")} AI예요`} footer="진단과 치료는 사람 전문가가 해요.">
              <span slot="media" className="fr-icon"><Icon name="chat" size={20} /></span>
            </ListItem>
            <ListItem title="기록은 이렇게 둬요" footer="원문은 이 기기에, 동의한 기억은 계정에 둬요. 답변을 만들 때는 AI 서비스로 보내요.">
              <span slot="media" className="fr-icon"><Icon name="lock" size={20} /></span>
            </ListItem>
          </List>
          <a href="tel:109" className="fr-sos">
            <span><b>위급할 때는 109</b><small>24시간 사람과 이야기할 수 있어요</small></span>
            <span className="fr-call" aria-hidden="true">전화</span>
          </a>
          {next("q1", "알겠어요")}
        </FirstRunScreen>
      );

    case "q1":
    case "q2": {
      const q = QUESTIONS[step === "q1" ? 0 : 1];
      return (
        <FirstRunScreen key={step} tone="cream" className={motion}>
          {top}
          <FirstRunHeading eyebrow={step === "q1" ? "나무 뒤에서 누가 보고 있어요" : "대답할 때마다 한 발짝씩"} title={q.text} className="mt-2" />
          <div className="fr-options mt-7" role="group" aria-label={q.text}>
            {q.options.map((o, i) => (
              <Button key={o} variant="plain" className="fr-option" aria-pressed={answers[q.id] === o} onClick={() => answer(q.id, o, i, step === "q1" ? "q2" : "meet")}>{o}</Button>
            ))}
          </div>
          <StreetLand />
          {step === "q1" ? <>
            {tappableCat("fr-cat--far")}
            <FrontTree />
          </> : tappableCat("fr-cat--near")}
        </FirstRunScreen>
      );
    }

    case "meet":
      return (
        <FirstRunScreen key={step} tone="cream" className={motion}>
          {top}
          <FirstRunHeading eyebrow="산전수전 다 겪은 길고양이" title="…뭘 봐." description={describeStyle(style, answers).tell} cat className="mt-2" />
          <StreetLand />
          {tappableCat("fr-cat--meet")}
          {next("adopt")}
        </FirstRunScreen>
      );

    case "adopt":
      return (
        <FirstRunScreen key={step} tone="cream" className={motion}>
          {top}
          <FirstRunHeading title="데려갈까요?" description="꾹 누르고 있으면 다가와요." className="mt-2" />
          <StreetLand />
          <div className="fr-cat fr-cat--adopt" data-holding={holding || undefined}>{catPose}</div>
          <div className="fr-hold">
            <Button variant="plain"
              aria-label="꾹 눌러서 데려가기"
              onPointerDown={holdStart}
              onPointerUp={holdEnd}
              onPointerLeave={holdEnd}
              onPointerCancel={holdEnd}
              onClick={(e) => e.detail === 0 && adopt()} // 키보드로 누르면 바로 데려간다
              onContextMenu={(e) => e.preventDefault()}
              className="fr-hold-button">
              {/* 누르고 있는 동안 차오르는 고리. 가운데 그림은 공통 아이콘을 쓴다. */}
              <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
                <circle cx="48" cy="48" r="44" fill="#fff" />
                <circle cx="48" cy="48" r="44" fill="none" stroke="#EFE6D9" strokeWidth="5" />
                <circle className="fr-hold-ring" cx="48" cy="48" r="44" fill="none" stroke="var(--fr-ink)" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={RING} strokeDashoffset={holding ? 0 : RING} transform="rotate(-90 48 48)"
                  style={holding ? { transitionDuration: `${HOLD_MS}ms` } : undefined} />
              </svg>
              <Icon name="paw" size={34} />
            </Button>
          </div>
        </FirstRunScreen>
      );

    case "door":
      return (
        <FirstRunScreen key={step} tone="room" className={motion}>
          {top}
          <FirstRunHeading title="…따라가는 거 아니다." description="꼬리가 서 있어요." cat className="mt-2" />
          <div className="fr-door" aria-hidden="true"><StreetLand /></div>
          <div className="fr-floor" aria-hidden="true" />
          {tappableCat("fr-cat--door")}
          {next("spot")}
        </FirstRunScreen>
      );

    case "spot":
      return (
        <FirstRunScreen key={step} tone="room" className={motion}>
          {top}
          <FirstRunHeading title="…아무 데나." description="그래도 고르면 그쪽에 앉아요." cat className="mt-2" />
          <div className="fr-floor" aria-hidden="true" />
          {/* 고른 색의 방석 위에서 웅크려 잔다. 색을 바꾸면 눈이 동그래졌다가 다시 잔다. */}
          <div className="fr-cushion" aria-hidden="true"><Cushion base={swatch.base} light={swatch.light} /></div>
          {tappableCat("fr-cat--spot")}
          <FirstRunFooter>
            <p className="fr-pick-label" aria-hidden="true">{swatch.label}</p>
            <div className="fr-swatches" role="radiogroup" aria-label="앉을 자리 색">
              {COLORS.map((c, i) => (
                <Button key={c.id} variant="plain" role="radio" aria-checked={color === c.id} aria-label={c.label} className="fr-swatch"
                  onClick={() => { sfx.pick(i); setColor(c.id); cat.notice(); }}
                  style={{ background: `linear-gradient(160deg, ${c.light}, ${c.base})` }} />
              ))}
            </div>
            <Button tone="ink" fullWidth onClick={() => go("voice")}>다음</Button>
          </FirstRunFooter>
        </FirstRunScreen>
      );

    case "voice":
      return (
        <FirstRunScreen key={step} tone="room" className={motion}>
          {top}
          <FirstRunHeading title="…들어 보고 골라." description="언제든 바꿀 수 있어요." cat className="mt-2" />
          <div className="flex min-h-0 flex-1 items-center justify-center py-4">
            <CatRings size={220}>
              <Buddy size={170} state={preview.playing ? "speaking" : "idle"} outputLevel={preview.level} outputShape={preview.shape} groundShadow />
            </CatRings>
          </div>
          <div className="fr-voices" role="radiogroup" aria-label="목소리">
            {VOICES.map((v, i) => (
              <Button key={v.id} variant="plain" role="radio" aria-checked={voice === v.id} aria-label={`${v.label}, ${v.desc}`} className="fr-option"
                onClick={() => pickVoice(v.id, i)}>{v.label}</Button>
            ))}
          </div>
          <p className="fr-desc mt-4 text-center" aria-live="polite">{voiceInfo.label} · {voiceInfo.desc}</p>
          <FirstRunFooter><Button tone="ink" fullWidth onClick={() => { stopPreview(); go("naming"); }}>다음</Button></FirstRunFooter>
        </FirstRunScreen>
      );

    case "naming":
      return (
        <FirstRunScreen key={step} tone="room" className={motion}>
          {top}
          <FirstRunHeading title={`${companionName}? …촌스럽네.`} description="골골 소리가 나요." cat className="mt-2" />
          <div className="fr-floor" aria-hidden="true" />
          <div className="fr-glow fr-glow--warm" aria-hidden="true" />
          {tappableCat("fr-cat--name")}
          <form className="contents" onSubmit={(e) => { e.preventDefault(); finish(); }}>
            <FirstRunFooter>
              <TextField label="이름" hideLabel variant="plain" id="companion" value={companion}
                onChange={(e) => setCompanion(e.target.value)} maxLength={10} enterKeyHint="done" inputClassName="fr-input" />
              <Button type="submit" tone="ink" fullWidth>이 이름으로 할게요</Button>
            </FirstRunFooter>
          </form>
        </FirstRunScreen>
      );
  }
}
