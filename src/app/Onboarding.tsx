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
  ONBOARDING_STEPS,
  PROMISE_REPLY,
  QUESTIONS,
  QUESTION_STEPS,
  SUMMARY_FIX_REPLY,
  SUMMARY_YES_REPLY,
  type Answers,
  type ColorId,
  type OnboardingStep,
  type Profile,
  type QuestionId,
  type ShapeId,
  type VoiceId,
  cleanName,
  cleanNickname,
  clearOnboardingDraft,
  concernId,
  describeStyle,
  loadOnboardingDraft,
  matchStyle,
  meetLine,
  nameReply,
  replyLine,
  saveOnboardingDraft,
  summaryLine,
  supportId,
} from "@/lib/onboarding";
import * as sfx from "@/lib/sound";

// 첫 실행의 '캐릭터 만나기'. 상담 접수 순서를 가볍게 따른다(Notion 'HERE · 온보딩 B안 — 상담 접수 방식').
// 시작 전 약속(AI·기록·109) → 내 이름 → 질문 넷(요즘 마음 · 마음이 가는 것 · 바라는 것 · 곁에 있는 사람)
// → 만나서 데려가기(많이 힘들면 109) → 들은 것 정리·확인 → 집 안에서 이름 짓기.
// 앉을 자리 색과 목소리는 기본값으로 시작하고 메뉴 → 캐릭터에서 언제든 바꾼다(첫 대화까지 화면을 줄이려고).
// 고양이는 장면마다 한 가지 동작만 끊김 없이 반복한다(장면 안에서 다른 동작으로 바꿔 끼우지 않는다).
// 큰 글씨는 고양이의 말, 작은 글씨는 서비스가 덧붙이는 속마음이다. 안내·질문·109는 고양이 말투를 쓰지 않는다.
// 답을 고르면 고양이가 한 줄 받아친 뒤(REPLY_MS) 다음 장면으로 넘어간다. 받아치는 말은 lib/onboarding.ts의 REPLIES.
// 장면 순서(ONBOARDING_STEPS)는 테스트에서도 읽도록 lib/onboarding.ts에 둔다. 안내(AI·기록·109)가 맨 앞이다.
export { ONBOARDING_STEPS, type OnboardingStep };
type Step = OnboardingStep;
const ORDER = ONBOARDING_STEPS;

// 장면마다 고양이가 반복하는 한 가지 동작. 여러 동작을 이어 붙이면 영상이 바뀔 때마다 끊겨 보여서, 장면 안에서는 바꾸지 않는다.
// 만나서 데려가기는 앉아서 숨 쉬고 깜박이며 힐끔 보는 기본 자세다. 꾹 누르는 동안 살짝 커지며 다가오는 것만 더한다.
// 시작 전 약속 장면에는 고양이가 없다(안내를 읽는 데 집중).
const SCENE_POSE: Partial<Record<Step, CatPose>> = { name: "sleep", q1: "groom", q2: "glare", q3: "glare", q4: "base", meet: "base", summary: "base", naming: "purr" };
const SCENE_POSES = [...new Set(Object.values(SCENE_POSE))]; // 온보딩에서 쓰는 동작만 미리 받는다

// 질문 장면의 윗줄(서술)과 고양이 자리. 대답할 때마다 고양이가 한 발짝씩 가까워진다.
const QUESTION_SCENES = {
  q1: { eyebrow: "나무 뒤에서 누가 보고 있어요", place: "fr-cat--far", tree: true },
  q2: { eyebrow: "슬쩍 고개를 내밀어요", place: "fr-cat--far", tree: false },
  q3: { eyebrow: "대답할 때마다 한 발짝씩", place: "fr-cat--near", tree: false },
  q4: { eyebrow: "어느새 바로 옆에 앉았어요", place: "fr-cat--near", tree: false },
} as const;
type QuestionStep = keyof typeof QUESTION_SCENES;

// 처음 시작할 때의 꾸미기 기본값(메뉴 → 캐릭터에서 바꾼다).
const START_COLOR: ColorId = "lavender";
const START_VOICE: VoiceId = "marin";

const HOLD_MS = 1400;
const LEAVE_MS = 150;
const REPLY_MS = 1300; // 고양이가 받아친 한 줄을 읽을 시간
const RING = 2 * Math.PI * 44;

/**
 * initialStep·initialAnswers는 개발용 미리보기에서 중간 장면부터 열 때만 쓴다(이때는 하던 자리를 되살리거나 남기지 않는다).
 * saving·saveError·onRetry: 마지막 '이 이름으로 할게요' 뒤 프로필을 저장하는 동안 이 화면을 그대로 두고, 버튼에 진행·실패를 보여 준다.
 * onDone은 '이 이름으로 할게요'를 눌렀을 때 한 번만 부르고, 실패한 뒤 다시 저장은 onRetry로 한다.
 */
export default function Onboarding({ onDone, initialStep, initialAnswers = {}, saving = false, saveError, onRetry }: {
  onDone: (p: Profile) => void; initialStep?: Step; initialAnswers?: Answers;
  saving?: boolean; saveError?: string; onRetry?: () => void;
}) {
  const preview = initialStep !== undefined;
  // 새로 고침·탭이 내려간 뒤에도 하던 장면부터 이어 간다(이 탭에만 잠깐 둔다).
  const [draft] = useState(() => (preview ? null : loadOnboardingDraft()));
  const [step, setStep] = useState<Step>(initialStep ?? draft?.step ?? "promise");
  const [nickname, setNickname] = useState(draft?.nickname ?? "");
  const [answers, setAnswers] = useState<Answers>(draft?.answers ?? initialAnswers);
  const shape: ShapeId = "cloud"; // Legacy profile value; the character is now a cat.
  // 고양이 이름은 마지막 장면에서 처음 짓는다("이름? …없어. 네 맘대로 해.").
  const [companion, setCompanion] = useState(draft?.companion ?? "");
  const [reply, setReply] = useState(""); // 고양이가 방금 받아친 한 줄(다음 장면으로 넘어가면 지운다)
  const [fixing, setFixing] = useState(false); // 정리 화면에서 '조금 달라요'를 눌러 다시 고르는 중
  const [muted, setMuted] = useState(false);
  const [holding, setHolding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false); // 늦게 실행되는 타이머·이벤트도 지금 넘어가는 중인지 알 수 있게 state와 같이 둔다
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // 받아친 말을 잠깐 보여 주고 넘어가는 타이머
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

  // 장면·이름·답이 바뀔 때마다 하던 자리를 남긴다(마지막 버튼을 누른 뒤에는 남기지 않는다).
  useEffect(() => {
    if (preview || finished.current) return;
    saveOnboardingDraft({ step, nickname, answers, companion });
  }, [preview, step, nickname, answers, companion]);

  // 저장이 실패 없이 끝났는데 이 화면이 그대로 남아 있으면 마지막 버튼을 다시 누를 수 있게 한다.
  useEffect(() => {
    if (!saving && !saveError) finished.current = false;
  }, [saving, saveError]);

  // 저장하는 동안 버튼이 잠겨 포커스가 body로 떨어졌으면, 실패를 알린 뒤 '다시 저장'으로 돌려놓는다.
  const shownError = saving ? undefined : saveError;
  useEffect(() => {
    if (shownError && document.activeElement === document.body) doneButton.current?.focus();
  }, [shownError]);

  const name = cleanNickname(nickname);
  const style = matchStyle(answers);
  const companionName = cleanName(companion);
  const meet = meetLine(answers);

  const catPose = <PoseCat pose={SCENE_POSE[step] ?? "base"} preload={SCENE_POSES} />;
  const sceneCat = (place: string) => <div className={`fr-cat ${place}`} aria-hidden="true">{catPose}</div>;
  // 고양이가 받아친 한 줄. 화면 낭독기도 읽도록 늘 같은 자리에 두고 내용만 바꾼다.
  const replyLineEl = <p className="fr-reply" role="status" aria-live="polite">{reply}</p>;

  // 화면 전환: 지금 화면이 잠깐 흐려지며 사라지고(LEAVE_MS), 다음 화면이 위로 살짝 떠오르며 나타난다.
  function go(next: Step, sound = true) {
    if (leavingRef.current) return;
    // 넘어가기 전에 남은 타이머(받아친 뒤 넘어가기·꾹 누르기)를 정리해, 바뀐 장면에서 늦게 실행되지 않게 한다.
    if (answerTimer.current) { clearTimeout(answerTimer.current); answerTimer.current = null; }
    holdEnd();
    if (sound) sfx.tick();
    // 답을 다시 고를 수 있는 건 다음 장면이 나타난 뒤다(흐려지는 동안 누른 답이 앞 답을 바꾸거나 한 번 더 넘기지 않게).
    const arrive = () => {
      setStep(next);
      setReply("");
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

  // 고양이가 한 줄 받아친 뒤 다음 장면으로 넘어간다. 받아치는 동안에는 다른 답을 누를 수 없다.
  function say(line: string, next: Step) {
    if (advancing.current || leavingRef.current) return false;
    advancing.current = true;
    setReply(line);
    answerTimer.current = setTimeout(() => { answerTimer.current = null; go(next, false); }, line ? REPLY_MS : 500);
    return true;
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

  // 질문 4 다음은 데려가기다. 정리 화면에서 고치러 온 경우에는 정리 화면으로 바로 돌아가되,
  // 고치면서 '많이 힘들어요'를 골랐으면 109를 보여 주는 데려가기를 다시 거친다.
  function nextAfter(q: QuestionStep, nextAnswers: Answers): Step {
    if (q === "q1") return "q2";
    if (q === "q2") return "q3";
    if (q === "q3") return "q4";
    return fixing && !meetLine(nextAnswers).tough ? "summary" : "meet";
  }

  function answer(q: QuestionStep, id: QuestionId, value: string, i: number) {
    if (advancing.current || leavingRef.current) return;
    const nextAnswers = { ...answers, [id]: value };
    if (!say(replyLine(id, value), nextAfter(q, nextAnswers))) return;
    sfx.pick(i);
    setAnswers(nextAnswers);
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
    go("summary", false);
  }

  function finish() {
    if (finished.current || saving) return; // 두 번 눌러도 저장은 한 번만 시작한다
    finished.current = true;
    if (!preview) clearOnboardingDraft();
    sfx.stopPad();
    const concern = concernId(answers.concern);
    const support = supportId(answers.support);
    onDone({ nickname: nickname.trim(), companion: companionName, shape, color: START_COLOR, voice: START_VOICE, style, ...(concern ? { concern } : {}), ...(support ? { support } : {}) });
  }

  // 나갈 때는 짧게 흐려지고, 들어올 때는 위에서부터 차례로 떠오른다. 동작 줄이기를 켜면 바로 바뀐다.
  // 흐려지며 나가는 화면은 더 누를 수 없다.
  const motion = leaving
    ? "pointer-events-none motion-safe:animate-screen-out"
    : "motion-safe:[&>*]:animate-screen-in [&>*:nth-child(2)]:[animation-delay:60ms] [&>*:nth-child(3)]:[animation-delay:120ms] [&>*:nth-child(4)]:[animation-delay:180ms] [&>*:nth-child(n+5)]:[animation-delay:240ms]";
  const sound = soundStarted ? <SoundToggle muted={muted} onToggle={toggleSound} /> : undefined;
  // 저장하는 중이거나 실패했을 때는 뒤로 가지 않는다(고친 내용이 '다시 저장'에 반영되지 않으므로).
  const locked = saving || Boolean(saveError);
  const top = <FirstRunTopBar onBack={step === "promise" || locked ? undefined : back} end={sound} />;

  switch (step) {
    // 시작 전 약속: 상담 접수의 사전 동의처럼, 이야기를 시작하기 전에 AI라는 것·기록·109를 먼저 알린다.
    case "promise":
      return (
        <FirstRunScreen key={step} tone="cream" className={motion} scroll>
          {top}
          <FirstRunHeading eyebrow="골목 끝에 누가 웅크리고 있어요" title="…뭐야. 나 AI야. 사람 아니고."
            description="이야기하기 전에 알아 두세요." cat focusOnMount className="mt-2" />
          <List strong inset dividersIos className="fr-list mx-5 mt-7">
            <ListItem title="이 고양이는 AI예요" footer="들어 주는 건 해요. 진단과 치료는 사람 전문가가 해요.">
              <span slot="media" className="fr-icon"><Icon name="chat" size={20} /></span>
            </ListItem>
            <ListItem title="기록은 이렇게 둬요" footer="원문은 이 기기에, 동의한 기억은 계정에 둬요. 답변을 만들 때는 AI 서비스로 보내요.">
              <span slot="media" className="fr-icon"><Icon name="lock" size={20} /></span>
            </ListItem>
            <ListItem title="위험한 말이 나오면 109부터" footer="자살·자해 같은 말이 나오면 답보다 109 안내를 먼저 보여 줘요.">
              <span slot="media" className="fr-icon"><Icon name="info" size={20} /></span>
            </ListItem>
          </List>
          <a href="tel:109" className="fr-sos">
            <span><b>위급할 때는 109</b><small>24시간 사람과 이야기할 수 있어요</small></span>
            <span className="fr-call" aria-hidden="true">전화</span>
          </a>
          {replyLineEl}
          <FirstRunFooter>
            <Button tone="ink" fullWidth onClick={() => { startSound(); say(PROMISE_REPLY, "name"); }}>알겠어요</Button>
          </FirstRunFooter>
        </FirstRunScreen>
      );

    case "name":
      return (
        <FirstRunScreen key={step} tone="cream" className={motion}>
          {top}
          {/* 길 위에서 웅크려 자는 고양이(자는 동작만 반복) */}
          <div className="fr-name-cat" aria-hidden="true">{catPose}</div>
          <FirstRunHeading title="뭐라고 부르면 될까요?" description="고양이가 이 이름으로 불러요. 별명이어도 괜찮아요." focusOnMount />
          {/* 폼도 하나의 칸이라 들어올 때 다른 줄처럼 차례로 떠오른다(display: contents면 애니메이션이 닿지 않는다). */}
          <form className="flex grow flex-col" onSubmit={(e) => {
            e.preventDefault();
            // AI에 넘길 수 있는 이름일 때만 넘어간다(이모지·기호만 적으면 부를 이름이 남지 않는다).
            if (!name) return;
            startSound();
            say(nameReply(name), "q1");
          }}>
            {/* 이름표는 입력칸 위에 따로, 칸 안은 왼쪽부터 적는다(로그인 시트 입력칸과 같은 결). */}
            <div className="fr-field fr-labeled mt-9">
              <TextField label="이름이나 별명" variant="plain" id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)}
                maxLength={12} placeholder="부를 이름을 적어 주세요" autoComplete="nickname" enterKeyHint="next" inputClassName="fr-input fr-input--left"
                help={nickname.trim() && !name ? "글자나 숫자로 적어 주세요." : undefined} />
            </div>
            {replyLineEl}
            <FirstRunFooter><Button type="submit" tone="ink" fullWidth disabled={!name}>다음</Button></FirstRunFooter>
          </form>
        </FirstRunScreen>
      );

    case "q1":
    case "q2":
    case "q3":
    case "q4": {
      const id = QUESTION_STEPS[step];
      const q = QUESTIONS.find((x) => x.id === id)!;
      const scene = QUESTION_SCENES[step];
      return (
        <FirstRunScreen key={step} tone="cream" className={motion}>
          {top}
          <FirstRunHeading eyebrow={step === "q1" && fixing ? SUMMARY_FIX_REPLY : scene.eyebrow} title={q.text} focusOnMount className="mt-2" />
          <div className="fr-options mt-7" role="group" aria-label={q.text}>
            {q.options.map((o, i) => (
              <Button key={o} variant="plain" className="fr-option" aria-pressed={answers[id] === o} onClick={() => answer(step, id, o, i)}>{o}</Button>
            ))}
          </div>
          {replyLineEl}
          <StreetLand />
          {sceneCat(scene.place)}
          {scene.tree && <FrontTree />}
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

    // 들은 것 정리: 고른 답을 되짚고 맞는지 묻는다(상담자 기본 원칙 [2] 요약하고 빠진 것 묻기). 해석·진단은 덧붙이지 않는다.
    case "summary":
      return (
        <FirstRunScreen key={step} tone="room" className={motion}>
          {top}
          <FirstRunHeading eyebrow="곁에 웅크리고 앉았어요" title="정리하면 이거지." description={summaryLine(name, answers)} cat focusOnMount className="mt-2" />
          <div className="fr-name-scene" aria-hidden="true">
            <div className="fr-name-scene-cat"><span className="fr-rug" />{catPose}</div>
          </div>
          {replyLineEl}
          <FirstRunFooter>
            <Button tone="ink" fullWidth onClick={() => { if (say(SUMMARY_YES_REPLY, "naming")) setFixing(false); }}>맞아요</Button>
            <Button variant="tonal" tone="ink" className="fr-ghost" fullWidth onClick={() => { if (say(SUMMARY_FIX_REPLY, "q1")) setFixing(true); }}>조금 달라요</Button>
          </FirstRunFooter>
        </FirstRunScreen>
      );

    // 이름 짓기가 마지막 장면이다. '이 이름으로 할게요' 뒤 저장하는 동안 이 화면에 머물며 버튼이 진행을 보여 주고,
    // 실패하면 바로 위에 알린 뒤 같은 버튼으로 다시 저장한다.
    case "naming":
      return (
        <FirstRunScreen key={step} tone="room" className={motion}>
          {top}
          <FirstRunHeading title={companion.trim() ? `${companionName}? …촌스럽네. 근데 뭐, 싫진 않아.` : "이름? …없어. 네 맘대로 해."}
            description="골골 소리가 나요." cat focusOnMount className="mt-2" />
          {/* 집 안, 작은 러그 위에서 식빵 자세로 골골(이 동작만 반복). 바닥 띠 없이 고양이만 가운데 둔다. */}
          <div className="fr-name-scene" aria-hidden="true">
            <div className="fr-name-scene-cat"><span className="fr-rug" />{catPose}</div>
          </div>
          <form className="flex flex-col" onSubmit={(e) => { e.preventDefault(); if (saveError) onRetry?.(); else if (companion.trim()) finish(); }}>
            <FirstRunFooter>
              <div className="fr-labeled">
                <TextField label="고양이 이름" variant="plain" id="companion" value={companion} placeholder="이름을 지어 주세요"
                  onChange={(e) => setCompanion(e.target.value)} maxLength={10} enterKeyHint="done" inputClassName="fr-input fr-input--left" disabled={locked} />
              </div>
              {shownError && <p id={errorId} role="alert" className="fr-error">{shownError}</p>}
              <Button ref={doneButton} type="submit" tone="ink" fullWidth loading={saving} disabled={!companion.trim()}
                aria-describedby={shownError ? errorId : undefined}>{saveError ? "다시 저장" : "이 이름으로 할게요"}</Button>
            </FirstRunFooter>
          </form>
        </FirstRunScreen>
      );
  }
}
