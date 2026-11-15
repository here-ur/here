"use client";

import List from "framework7-react/components/list.js";
import ListItem from "framework7-react/components/list-item.js";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Icon } from "./art";
import { FirstRunFooter, FirstRunHeading, FirstRunScreen, FirstRunTopBar, FrontTree, SoundToggle, StreetLand } from "./FirstRun";
import PoseCat from "./PoseCat";
import type { CatPose } from "@/lib/cat-poses";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import {
  DEFAULT_COMPANION,
  ONBOARDING_STEPS,
  QUESTIONS,
  type Answers,
  type ColorId,
  type OnboardingStep,
  type Profile,
  type ShapeId,
  type VoiceId,
  cleanName,
  cleanNickname,
  clearOnboardingDraft,
  describeStyle,
  josa,
  loadOnboardingDraft,
  matchStyle,
  meetLine,
  saveOnboardingDraft,
} from "@/lib/onboarding";
import * as sfx from "@/lib/sound";

// 첫 실행의 '캐릭터 만나기'. 내 이름을 알려 주고, 길 위에서 나무 뒤의 고양이를 발견해(질문 두 개),
// 만나서 꾹 눌러 데려간 뒤 집 안에서 이름을 지어 주고, 마지막에 안내(AI·기록·109)를 본다.
// 앉을 자리 색과 목소리는 기본값으로 시작하고 메뉴 → 캐릭터에서 언제든 바꾼다(첫 대화까지 화면을 줄이려고).
// 고양이는 장면마다 한 가지 동작만 끊김 없이 반복한다(장면 안에서 다른 동작으로 바꿔 끼우지 않는다).
// 큰 글씨는 고양이의 말, 작은 글씨는 서비스가 덧붙이는 속마음이다. 안내·질문·109는 고양이 말투를 쓰지 않는다.
// 장면 순서(ONBOARDING_STEPS)는 테스트에서도 읽도록 lib/onboarding.ts에 둔다. 안내(AI·기록·109)가 맨 끝이다.
export { ONBOARDING_STEPS, type OnboardingStep };
type Step = OnboardingStep;
const ORDER = ONBOARDING_STEPS;

// 장면마다 고양이가 반복하는 한 가지 동작. 여러 동작을 이어 붙이면 영상이 바뀔 때마다 끊겨 보여서, 장면 안에서는 바꾸지 않는다.
// 만나서 데려가기는 앉아서 숨 쉬고 깜박이며 힐끔 보는 기본 자세다(덮칠 준비 자세는 이를 드러내 하악질처럼 보여서
// "꾹 누르면 다가와요"와 맞지 않았다). 꾹 누르는 동안 살짝 커지며 다가오는 것만 더한다. 안내 장면에는 고양이가 없다.
const SCENE_POSE: Partial<Record<Step, CatPose>> = { name: "sleep", q1: "groom", q2: "glare", meet: "base", naming: "purr" };
const SCENE_POSES = Object.values(SCENE_POSE); // 온보딩에서 쓰는 동작만 미리 받는다

// 처음 시작할 때의 꾸미기 기본값(메뉴 → 캐릭터에서 바꾼다).
const START_COLOR: ColorId = "lavender";
const START_VOICE: VoiceId = "marin";

const HOLD_MS = 1400;
const LEAVE_MS = 150;
const RING = 2 * Math.PI * 44;

/**
 * initialStep·initialAnswers는 개발용 미리보기에서 중간 장면부터 열 때만 쓴다(이때는 하던 자리를 되살리거나 남기지 않는다).
 * saving·saveError·onRetry: 마지막 '알겠어요' 뒤 프로필을 저장하는 동안 이 화면을 그대로 두고, 버튼에 진행·실패를 보여 준다.
 * onDone은 '알겠어요'를 눌렀을 때 한 번만 부르고, 실패한 뒤 다시 저장은 onRetry로 한다.
 */
export default function Onboarding({ onDone, initialStep, initialAnswers = {}, saving = false, saveError, onRetry }: {
  onDone: (p: Profile) => void; initialStep?: Step; initialAnswers?: Answers;
  saving?: boolean; saveError?: string; onRetry?: () => void;
}) {
  const preview = initialStep !== undefined;
  // 새로 고침·탭이 내려간 뒤에도 하던 장면부터 이어 간다(이 탭에만 잠깐 둔다).
  const [draft] = useState(() => (preview ? null : loadOnboardingDraft()));
  const [step, setStep] = useState<Step>(initialStep ?? draft?.step ?? "name");
  const [nickname, setNickname] = useState(draft?.nickname ?? "");
  const [answers, setAnswers] = useState<Answers>(draft?.answers ?? initialAnswers);
  const shape: ShapeId = "cloud"; // Legacy profile value; the character is now a cat.
  const [companion, setCompanion] = useState(draft?.companion ?? DEFAULT_COMPANION);
  const [muted, setMuted] = useState(false);
  const [holding, setHolding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false); // 늦게 실행되는 타이머·이벤트도 지금 넘어가는 중인지 알 수 있게 state와 같이 둔다
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // 답을 고른 뒤 잠깐 보여 주고 넘어가는 타이머
  const stopRiser = useRef<() => void>(() => {});
  const [soundStarted, setSoundStarted] = useState(false);
  const advancing = useRef(false);
  const finished = useRef(false);
  const doneButton = useRef<HTMLButtonElement>(null);
  const errorId = useId();

  useEffect(() => () => sfx.stopPad(), []);
  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (answerTimer.current) clearTimeout(answerTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }, []);

  // 장면·이름·답이 바뀔 때마다 하던 자리를 남긴다('알겠어요'를 누른 뒤에는 남기지 않는다).
  useEffect(() => {
    if (preview || finished.current) return;
    saveOnboardingDraft({ step, nickname, answers, companion });
  }, [preview, step, nickname, answers, companion]);

  // 저장이 실패 없이 끝났는데 이 화면이 그대로 남아 있으면 '알겠어요'를 다시 누를 수 있게 한다.
  useEffect(() => {
    if (!saving && !saveError) finished.current = false;
  }, [saving, saveError]);

  // 저장하는 동안 버튼이 잠겨 포커스가 body로 떨어졌으면, 실패를 알린 뒤 '다시 저장'으로 돌려놓는다.
  const shownError = saving ? undefined : saveError;
  useEffect(() => {
    if (shownError && document.activeElement === document.body) doneButton.current?.focus();
  }, [shownError]);

  const name = nickname.trim() || "친구";
  const style = matchStyle(answers);
  const companionName = cleanName(companion);
  const meet = meetLine(answers);

  const catPose = <PoseCat pose={SCENE_POSE[step] ?? "base"} preload={SCENE_POSES} />;
  const sceneCat = (place: string) => <div className={`fr-cat ${place}`} aria-hidden="true">{catPose}</div>;

  // 화면 전환: 지금 화면이 잠깐 흐려지며 사라지고(LEAVE_MS), 다음 화면이 위로 살짝 떠오르며 나타난다.
  function go(next: Step, sound = true) {
    if (leavingRef.current) return;
    // 넘어가기 전에 남은 타이머(답 고른 뒤 넘어가기·꾹 누르기)를 정리해, 바뀐 장면에서 늦게 실행되지 않게 한다.
    if (answerTimer.current) { clearTimeout(answerTimer.current); answerTimer.current = null; }
    holdEnd();
    if (sound) sfx.tick();
    // 답을 다시 고를 수 있는 건 다음 장면이 나타난 뒤다(흐려지는 동안 누른 답이 앞 답을 바꾸거나 한 번 더 넘기지 않게).
    const arrive = () => {
      setStep(next);
      advancing.current = false;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      arrive();
      return;
    }
    leavingRef.current = true;
    setLeaving(true);
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      leavingRef.current = false;
      setLeaving(false);
      arrive();
    }, LEAVE_MS);
  }

  function back() {
    const i = ORDER.indexOf(step);
    if (i <= 0) return;
    go(ORDER[i - 1]); // go가 남은 타이머를 정리한다(답을 고른 직후 뒤로 가도 앞으로 넘어가지 않는다)
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
  }

  function answer(id: (typeof QUESTIONS)[number]["id"], value: string, i: number, next: Step) {
    if (advancing.current || leavingRef.current) return;
    advancing.current = true;
    sfx.pick(i);
    setAnswers((current) => ({ ...current, [id]: value }));
    answerTimer.current = setTimeout(() => { answerTimer.current = null; go(next, false); }, 500); // 고른 답이 잠깐 보이게
  }

  function holdStart() {
    if (holdTimer.current || leavingRef.current) return; // 이미 누르는 중이거나 넘어가는 중이면 다시 시작하지 않는다
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
    if (leavingRef.current) return; // 키보드로 두 번 누르거나 누르던 타이머가 늦게 와도, 넘어가는 중이면 다시 데려가지 않는다
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    stopRiser.current();
    sfx.buzz([40, 60, 120]);
    sfx.burst();
    setHolding(false);
    go("naming", false);
  }

  function finish() {
    if (finished.current || saving) return; // 두 번 눌러도 저장은 한 번만 시작한다
    finished.current = true;
    if (!preview) clearOnboardingDraft();
    sfx.stopPad();
    onDone({ nickname: nickname.trim(), companion: companionName, shape, color: START_COLOR, voice: START_VOICE, style });
  }

  // 나갈 때는 짧게 흐려지고, 들어올 때는 위에서부터 차례로 떠오른다. 동작 줄이기를 켜면 바로 바뀐다.
  // 흐려지며 나가는 화면은 더 누를 수 없다.
  const motion = leaving
    ? "pointer-events-none motion-safe:animate-screen-out"
    : "motion-safe:[&>*]:animate-screen-in [&>*:nth-child(2)]:[animation-delay:60ms] [&>*:nth-child(3)]:[animation-delay:120ms] [&>*:nth-child(4)]:[animation-delay:180ms] [&>*:nth-child(n+5)]:[animation-delay:240ms]";
  const sound = soundStarted ? <SoundToggle muted={muted} onToggle={toggleSound} /> : undefined;
  // 저장하는 중이거나 실패했을 때는 뒤로 가지 않는다(고친 내용이 '다시 저장'에 반영되지 않으므로).
  const locked = saving || Boolean(saveError);
  const top = <FirstRunTopBar onBack={step === "name" || locked ? undefined : back} end={sound} />;

  switch (step) {
    case "name":
      return (
        <FirstRunScreen key={step} tone="cream" className={motion}>
          {top}
          {/* 길 위에서 웅크려 자는 고양이(자는 동작만 반복) */}
          <div className="fr-name-cat" aria-hidden="true">{catPose}</div>
          <FirstRunHeading title="뭐라고 부르면 될까요?" description={`${josa(DEFAULT_COMPANION, "이", "가")} 이 이름으로 불러요.`} focusOnMount />
          {/* 폼도 하나의 칸이라 들어올 때 다른 줄처럼 차례로 떠오른다(display: contents면 애니메이션이 닿지 않는다). */}
          <form className="flex grow flex-col" onSubmit={(e) => {
            e.preventDefault();
            // AI에 넘길 수 있는 이름일 때만 넘어간다(이모지·기호만 적으면 부를 이름이 남지 않는다).
            if (!cleanNickname(nickname) || advancing.current) return;
            startSound();
            go("q1");
          }}>
            {/* 이름표는 입력칸 위에 따로, 칸 안은 왼쪽부터 적는다(로그인 시트 입력칸과 같은 결). */}
            <div className="fr-field fr-labeled mt-9">
              <TextField label="이름이나 별명" variant="plain" id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)}
                maxLength={12} placeholder="부를 이름을 적어 주세요" autoComplete="nickname" enterKeyHint="next" inputClassName="fr-input fr-input--left"
                help={nickname.trim() && !cleanNickname(nickname) ? "글자나 숫자로 적어 주세요." : undefined} />
            </div>
            <FirstRunFooter><Button type="submit" tone="ink" fullWidth disabled={!cleanNickname(nickname)}>다음</Button></FirstRunFooter>
          </form>
        </FirstRunScreen>
      );

    case "q1":
    case "q2": {
      const q = QUESTIONS[step === "q1" ? 0 : 1];
      return (
        <FirstRunScreen key={step} tone="cream" className={motion}>
          {top}
          <FirstRunHeading eyebrow={step === "q1" ? "나무 뒤에서 누가 보고 있어요" : "대답할 때마다 한 발짝씩"} title={q.text} focusOnMount className="mt-2" />
          <div className="fr-options mt-7" role="group" aria-label={q.text}>
            {q.options.map((o, i) => (
              <Button key={o} variant="plain" className="fr-option" aria-pressed={answers[q.id] === o} onClick={() => answer(q.id, o, i, step === "q1" ? "q2" : "meet")}>{o}</Button>
            ))}
          </div>
          <StreetLand />
          {step === "q1" ? <>
            {sceneCat("fr-cat--far")}
            <FrontTree />
          </> : sceneCat("fr-cat--near")}
        </FirstRunScreen>
      );
    }

    // 만나서 데려가기: 첫마디는 요즘 상태에 맞춰 세기를 낮춘다. 많이 힘들다고 했으면 109 안내를 그 자리에서 바로 보여 준다.
    case "meet":
      return (
        <FirstRunScreen key={step} tone="cream" className={motion}>
          {top}
          <FirstRunHeading eyebrow="산전수전 다 겪은 길고양이" title={meet.line}
            description={meet.tough ? "많이 힘든 날엔 사람과 바로 이야기할 수도 있어요." : describeStyle(style, answers).tell} cat focusOnMount className="mt-2" />
          {meet.tough && <a href="tel:109" className="fr-sos fr-sos--meet">
            <span><b>지금 이야기하고 싶다면 109</b><small>24시간 사람과 이야기할 수 있어요</small></span>
            <span className="fr-call" aria-hidden="true">전화</span>
          </a>}
          <StreetLand />
          <div className="fr-cat fr-cat--adopt" data-holding={holding || undefined} aria-hidden="true">{catPose}</div>
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
                  data-holding={holding || undefined} style={{ "--fr-hold-ms": `${HOLD_MS}ms` } as CSSProperties} />
              </svg>
              <Icon name="paw" size={34} />
            </Button>
            <p className="fr-hold-hint" aria-hidden="true">꾹 누르면 다가와요</p>
          </div>
        </FirstRunScreen>
      );

    case "naming":
      return (
        <FirstRunScreen key={step} tone="room" className={motion}>
          {top}
          <FirstRunHeading title={`${companionName}? …촌스럽네.`} description="골골 소리가 나요." cat focusOnMount className="mt-2" />
          {/* 집 안, 작은 러그 위에서 식빵 자세로 골골(이 동작만 반복). 바닥 띠 없이 고양이만 가운데 둔다. */}
          <div className="fr-name-scene" aria-hidden="true">
            <div className="fr-name-scene-cat"><span className="fr-rug" />{catPose}</div>
          </div>
          <form className="flex flex-col" onSubmit={(e) => { e.preventDefault(); if (companion.trim()) go("safety"); }}>
            <FirstRunFooter>
              <div className="fr-labeled">
                <TextField label="고양이 이름" variant="plain" id="companion" value={companion} placeholder="이름을 적어 주세요"
                  onChange={(e) => setCompanion(e.target.value)} maxLength={10} enterKeyHint="done" inputClassName="fr-input fr-input--left" />
              </div>
              <Button type="submit" tone="ink" fullWidth disabled={!companion.trim()}>이 이름으로 할게요</Button>
            </FirstRunFooter>
          </form>
        </FirstRunScreen>
      );

    case "safety":
      return (
        <FirstRunScreen key={step} tone="room" className={motion} scroll>
          {top}
          <FirstRunHeading eyebrow={`${name}님, ${josa(companionName, "과", "와")} 이야기하기 전에`} title="세 가지만 알아 두세요" focusOnMount className="mt-4" />
          <List strong inset dividersIos className="fr-list mx-5 mt-7">
            <ListItem title={`${josa(companionName, "은", "는")} AI예요`} footer="진단과 치료는 사람 전문가가 해요.">
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
          {/* 저장하는 동안 이 화면에 머물며 버튼이 진행을 보여 주고, 실패하면 바로 위에 알린 뒤 같은 버튼으로 다시 저장한다. */}
          <FirstRunFooter>
            {shownError && <p id={errorId} role="alert" className="fr-error">{shownError}</p>}
            <Button ref={doneButton} tone="ink" fullWidth loading={saving} aria-describedby={shownError ? errorId : undefined}
              onClick={saveError ? onRetry : finish}>{saveError ? "다시 저장" : "알겠어요"}</Button>
          </FirstRunFooter>
        </FirstRunScreen>
      );
  }
}
