"use client";

import { useEffect, useRef, useState } from "react";
import OnboardingStage, { type StageSnapshot } from "./OnboardingStage";
import type { MemberBasics } from "./member-basics-context";
import { basicsFromAnswers, basicsSaveError } from "@/lib/member-basics";
import {
  ONBOARDING_STEPS,
  BASICS_SCENES,
  pickOnboardingAnswers,
  STAGE_SCENES,
  type Answers,
  type ColorId,
  type OnboardingStep,
  type Profile,
  type ShapeId,
  type VoiceId,
  cleanName,
  clearOnboardingDraft,
  concernId,
  loadOnboardingDraft,
  matchStyle,
  resumeStep,
  saveOnboardingDraft,
  sceneOfStep,
  stepOfScene,
  supportId,
} from "@/lib/onboarding";

// 첫 실행의 '캐릭터 만나기'. 화면은 1번 톤 무대(OnboardingStage · public/onboarding)가 그리고, 여기서는 값만 잇는다:
// 하던 자리를 이 탭에 남겼다가 되살리고, 마지막 '대화 시작하기'에서 고른 답을 프로필로 바꿔 넘긴다.
// 흐름은 만남(자는 고양이에게 다가가면 AI라고 밝힌다) → 시작 전 약속(AI·기록·109) → 내 이름 → 질문 넷
// → 데려가기(많이 힘들면 109, 꾹 누른 뒤 들은 것 정리·확인) → 이름 짓기다. 새 회원은 내 이름 다음에 생일·성별을 묻고, 성별의 '다음'에서 저장한다.
// 기억 동의는 이 앞의 시트가 맡는다.
// 문구는 lib/onboarding.ts에 두고 무대에 넘긴다. 큰 글씨 중 한 글자씩 적히는 줄은 고양이의 말이고, 안내·질문·109는 서비스의 말이다.
// 장면 순서(ONBOARDING_STEPS)는 하던 자리를 남길 때 쓰는 이름이다(무대의 장면과의 짝은 sceneOfStep · stepOfScene).
export { ONBOARDING_STEPS, type OnboardingStep };

// 처음 시작할 때의 꾸미기 기본값(메뉴 → 캐릭터에서 바꾼다).
const START_SHAPE: ShapeId = "cloud"; // Legacy profile value; the character is now a cat.
const START_COLOR: ColorId = "lavender";
const START_VOICE: VoiceId = "marin";

/**
 * initialStep·initialAnswers는 개발용 미리보기에서 중간 장면부터 열 때만 쓴다(이때는 하던 자리를 되살리거나 남기지 않는다).
 * saving·saveError·onRetry: 마지막 '대화 시작하기' 뒤 프로필을 저장하는 동안 그 화면을 그대로 두고, 버튼에 진행·실패를 보여 준다.
 * onDone은 '대화 시작하기'를 눌렀을 때 한 번만 부르고, 실패한 뒤 다시 저장은 onRetry로 한다.
 */
export default function Onboarding({ onDone, initialStep, initialAnswers = {}, saving = false, saveError, onRetry, basics, askBasics: forceBasics, consent, onSignOut, afterConsent = false }: {
  onDone: (p: Profile) => void; initialStep?: OnboardingStep; initialAnswers?: Answers;
  saving?: boolean; saveError?: string; onRetry?: () => void;
  basics?: MemberBasics; onSignOut?: () => void;
  askBasics?: boolean; // 값이 이미 있어도 생일·성별 장면을 연다(개발용 '처음부터 다시 만들기'의 전체 흐름)
  consent?: () => Promise<string | null>; // 있으면 약속 장면에서 기억 동의 칸을 다시 보여 주고 '다음'에서 저장한다(같은 흐름)
  afterConsent?: boolean; // 방금 약속 장면에서 동의했으면 내 이름부터 잇는다
}) {
  const preview = initialStep !== undefined;
  // 새로 고침·탭이 내려간 뒤에도 하던 장면부터 이어 간다(이 탭에만 잠깐 둔다).
  const [draft] = useState(() => (preview ? null : loadOnboardingDraft()));
  const [askBasics] = useState(() => forceBasics === true || basics?.needed === true); // 시작할 때 정한다(저장한 뒤 뒤로 돌아와 고칠 수 있게 장면은 그대로 둔다)
  const [start] = useState(() => ({
    ...sceneOfStep(initialStep ?? resumeStep(afterConsent && (draft?.step ?? "promise") === "promise" ? "name" : draft?.step ?? "promise", askBasics), preview),
    initial: { nickname: draft?.nickname ?? "", companion: draft?.companion ?? "", answers: draft?.answers ?? initialAnswers },
  }));
  const finished = useRef(false);

  // 저장이 실패 없이 끝났는데 이 화면이 그대로 남아 있으면 마지막 버튼을 다시 누를 수 있게 한다.
  useEffect(() => {
    if (!saving && !saveError) finished.current = false;
  }, [saving, saveError]);

  // 장면·이름·답이 바뀔 때마다 하던 자리를 남긴다(마지막 버튼을 누른 뒤에는 남기지 않는다).
  function remember(snapshot: StageSnapshot) {
    if (preview || finished.current || snapshot.scene === "done") return;
    saveOnboardingDraft({ step: stepOfScene(snapshot.scene), nickname: snapshot.nickname, answers: pickOnboardingAnswers(snapshot.answers), companion: snapshot.companion });
  }

  // 약속의 '다음'(동의를 다시 받을 때)·성별의 '다음': 저장한 뒤에 넘어간다. 실패하면 그 글을 돌려주고 이 장면에 머문다.
  function beforeNext(snapshot: StageSnapshot) {
    if (snapshot.scene === "promise" && consent) return consent();
    if (snapshot.scene !== "gender" || !basics) return null;
    const values = basicsFromAnswers(snapshot.answers);
    if (!values) return Promise.resolve(basicsSaveError("invalid"));
    return basics.save(values.gender, values.birthDate)
      .then((result) => (result === "ok" ? null : basicsSaveError(result)))
      .catch(() => basicsSaveError("failed"));
  }

  function finish(snapshot: StageSnapshot) {
    if (saving) return;
    if (saveError) { onRetry?.(); return; }
    if (finished.current) return; // 두 번 눌러도 저장은 한 번만 시작한다
    finished.current = true;
    if (!preview) clearOnboardingDraft();
    const answers = pickOnboardingAnswers(snapshot.answers);
    const concern = concernId(answers.concern);
    const support = supportId(answers.support);
    onDone({
      nickname: snapshot.nickname.trim(), companion: cleanName(snapshot.companion), shape: START_SHAPE, color: START_COLOR, voice: START_VOICE,
      onboardingAnswers: answers,
      style: matchStyle(answers), ...(concern ? { concern } : {}), ...(support ? { support } : {}),
    });
  }

  return <OnboardingStage scene={start.scene} state={start.state} initial={start.initial} saving={saving} saveError={saveError} onChange={remember} onFinish={finish}
    scenes={STAGE_SCENES.filter((id) => askBasics || !(BASICS_SCENES as readonly string[]).includes(id))} beforeNext={beforeNext} onSignOut={onSignOut} consent={Boolean(consent)} />;
}
