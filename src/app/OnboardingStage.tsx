"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BASICS_SCENES,
  DEFAULT_COMPANION,
  QUESTIONS,
  REPLIES,
  STAGE_MEET_EYEBROW,
  STAGE_NOTICE,
  STAGE_OPEN,
  STAGE_SCENES,
  type Answers,
  type StageScene,
  meetLine,
  nameReply,
  namingLine,
} from "@/lib/onboarding";
import { isUnderAge, seoulToday } from "@/lib/member-basics";
import { MEMORY_CONSENT_DETAILS, MEMORY_CONSENT_NOTE } from "@/lib/memory-consent";
import { SFX_KEY, setSfxEnabled } from "@/lib/sfx";
import { firstFamily, gothicA1, outfit } from "./onboarding-fonts";
import { Button } from "./ui/Button";
import "./onboarding-stage.css";

// 캐릭터 만나기의 무대(1번 톤). 시안에서 만든 화면을 그대로 올린다: public/onboarding의 스크립트가 장면·동작·소리를 맡고,
// 이 컴포넌트는 그것을 섀도 루트 안에 세워 앱의 스타일과 섞이지 않게 한 뒤, 문구와 값(하던 자리·저장 상태)을 이어 준다.
// 무대는 390×844 기준으로 그려지고, 이 칸의 크기에 맞게 한 비율로 줄거나 늘어난다(둘레에 남는 띠는 장면의 바탕색).
// 무대 파일을 고치면 STAGE_VERSION을 올린다(브라우저가 옛 파일을 붙잡지 않게).
const STAGE_BASE = "/onboarding/";
const STAGE_VERSION = "2026-11-29r";
const SCRIPTS = ["copy.js", "cat.js", "sound.js", "phone.js", "scenes/promise.js", "scenes/birthday.js", "scenes/gender.js", "scenes/q2.js", "scenes/q4.js", "scenes/meet.js"];
const STYLES = ["phone.css", "scenes/promise.css", "scenes/birthday.css", "scenes/gender.css", "scenes/q2.css", "scenes/q4.css", "scenes/meet.css"];
const CAT_ART = "/characters/motion/"; // 고양이 그림은 홈과 같은 파일을 쓴다(앉은 그림·걷는 그림만 더했다)
const STAGE_W = 390;
const STAGE_H = 844;
const file = (name: string) => `${STAGE_BASE}${name}?v=${STAGE_VERSION}`;

export type StageField = "yellow" | "lilac" | "orange";
export type StageSnapshot = { scene: StageScene | "done"; field: StageField | null; nickname: string; companion: string; answers: Record<string, unknown> };
export type StageStart = { nickname?: string; companion?: string; answers?: Answers };
const FIELD: Record<StageField, string> = { yellow: "#FDE249", lilac: "#DDC1FF", orange: "#FE6F42" };
// 장면의 바탕색. 무대가 뜨기 전에도 그 장면의 색으로 칸을 채운다.
const SCENE_FIELD: Record<StageScene, StageField> = { open: "yellow", promise: "yellow", name: "lilac", birthday: "yellow", gender: "orange", q1: "yellow", q2: "lilac", q3: "orange", q4: "yellow", meet: "orange", naming: "lilac" };

/** 마지막 버튼의 진행·실패 표시(무대가 넘겨준다). */
type FinishControl = { busy(on: boolean): void; fail(message: string, retryLabel?: string): void };
type StageApi = { destroy(): void };
type StageEngine = {
  mount(host: HTMLElement, options: {
    assets: string; scene?: string; state?: string; initial?: StageStart; scenes?: readonly string[];
    actions?: { signOut?: () => void; consent?: boolean; noBack?: boolean };
    beforeNext?: (snapshot: StageSnapshot, control: FinishControl) => boolean | Promise<boolean>;
    onChange?: (snapshot: StageSnapshot) => void;
    onFinish?: (snapshot: StageSnapshot, control: FinishControl) => void;
  }): StageApi;
};
type StageCopy = {
  open: Record<string, unknown>;
  notice?: unknown;
  Q: unknown;
  REPLIES: unknown;
  meet: { line: (answers: Answers) => string; eyebrow: string };
  name: { reply: (nickname: string) => string };
  naming: { defaultName: string; line: (name: string) => string };
  about: { age: (year: number, month: number, day: number) => number };
  consent: { note: string };
  consentDetails?: unknown;
};
type StageSound = { onChange(listener: (on: boolean) => void): () => void };

declare global {
  interface Window {
    HerePhone?: StageEngine;
    HereCopy?: StageCopy;
    HereSound?: StageSound;
    HereCatPlainNames?: boolean;
    HereSoundKey?: string;
    HereSoundQuietToggle?: boolean;
    HereFontFamilies?: string[];
  }
}

// 섀도 루트 안에만 닿는 스타일: 무대의 자리와 글꼴. 글꼴 변수는 바깥(이 컴포넌트의 main)에서 물려받는다.
const STAGE_CSS = `
:host { display: block; }
.stage { position: absolute; left: 50%; top: 50%; width: ${STAGE_W}px; height: ${STAGE_H}px; margin: ${-STAGE_H / 2}px 0 0 ${-STAGE_W / 2}px; overflow: hidden; transform: scale(var(--stage-k, 1)); transform-origin: 50% 50%; }
.stage:has(.hp-scene[data-scene="birthday"]) { overflow: visible; }
.hp { --hp-font: var(--font-outfit), var(--font-gothic-a1), "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif; }
`;

let engine: Promise<void> | null = null;

/** 무대 스크립트를 차례대로 한 번만 받는다. 받지 못하면 다음에 다시 시도할 수 있게 비워 둔다. */
function loadEngine(): Promise<void> {
  if (engine) return engine;
  // 무대가 읽는 설정: 고양이 그림은 앱의 파일 이름 그대로, 소리 켬/끔은 앱의 효과음 설정과 같은 값
  window.HereCatPlainNames = true;
  window.HereSoundKey = SFX_KEY;
  window.HereSoundQuietToggle = true;
  window.HereFontFamilies = [firstFamily(gothicA1.style.fontFamily), firstFamily(outfit.style.fontFamily)].filter(Boolean);
  const loaded = SCRIPTS.reduce<Promise<void>>((chain, name) => chain.then(() => new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = file(name);
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`onboarding stage: ${name}`));
    document.head.append(script);
  })), Promise.resolve());
  engine = loaded.catch((error: unknown) => { engine = null; throw error; });
  return engine;
}

/** 무대의 문구를 앱의 문구(lib/onboarding.ts)로 덮어쓴다. 질문·대답은 앱이 한곳에서 관리하고 테스트한다. */
function applyCopy(copy: StageCopy) {
  Object.assign(copy.open, STAGE_OPEN);
  copy.notice = { ...STAGE_NOTICE, breaks: [...STAGE_NOTICE.breaks], items: STAGE_NOTICE.items.map((item) => ({ ...item })) };
  copy.Q = Object.fromEntries(QUESTIONS.map((q) => [q.id, { id: q.id, text: q.text, options: [...q.options] }]));
  copy.REPLIES = REPLIES;
  copy.meet.line = (answers) => meetLine(answers).line;
  copy.meet.eyebrow = STAGE_MEET_EYEBROW;
  copy.name.reply = (nickname) => nameReply(nickname);
  copy.naming.defaultName = DEFAULT_COMPANION;
  copy.naming.line = (name) => namingLine(name);
  copy.consent.note = MEMORY_CONSENT_NOTE;
  copy.consentDetails = MEMORY_CONSENT_DETAILS;
  // 나이는 서버와 같은 기준(한국 날짜)으로 잰다. 무대는 14 미만인지만 본다.
  copy.about.age = (year, month, day) => isUnderAge(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, seoulToday()) ? 13 : 14;
}

/**
 * scene·state·initial은 처음 한 번만 읽는다(무대가 그 뒤의 진행을 맡는다).
 * onFinish는 마지막 버튼('대화 시작하기')을 누를 때마다 불린다. 저장하는 동안(saving)에는 버튼이 잠기고,
 * 실패하면(saveError) 버튼 위에 그 글이 뜨고 버튼이 '다시 저장'이 된다.
 */
export default function OnboardingStage({ scene, state, initial, scenes, saving = false, saveError, onChange, onFinish, beforeNext, onSignOut, consent = false, noBack = false }: {
  scene?: StageScene;
  state?: string;
  initial?: StageStart;
  scenes?: readonly string[]; // 이번 흐름에서 여는 장면(없으면 생일·성별을 뺀 나머지)
  saving?: boolean;
  saveError?: string;
  onChange?: (snapshot: StageSnapshot) => void;
  onFinish: (snapshot: StageSnapshot) => void;
  beforeNext?: (snapshot: StageSnapshot) => Promise<string | null> | null; // 장면을 떠나기 전 저장. 실패하면 그 글을 돌려준다
  onSignOut?: () => void;
  consent?: boolean; // 약속 장면에서 기억 동의를 받는다
  noBack?: boolean; // 첫 장면이라 돌아갈 곳이 없다
}) {
  const host = useRef<HTMLDivElement>(null);
  const start = useRef({ consent, noBack, scene, state, initial, scenes: scenes ?? STAGE_SCENES.filter((id) => !(BASICS_SCENES as readonly string[]).includes(id)) });
  const handlers = useRef({ onChange, onFinish, beforeNext, onSignOut });
  const finishing = useRef<FinishControl | null>(null);
  const [field, setField] = useState<StageField>(SCENE_FIELD[scene ?? "open"]);
  const [activeScene, setActiveScene] = useState<string>(scene ?? "open");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { handlers.current = { onChange, onFinish, beforeNext, onSignOut }; });

  // 무대를 이 칸에 맞춘다(가로·세로 중 더 빠듯한 쪽에 맞춰 한 비율로).
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const fit = () => {
      // 칸의 제 크기(배치 기준)로 잰다: 바깥에서 zoom·transform으로 줄여 둔 화면(개발용 펼쳐 보기)에서도 한 번만 줄어든다.
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (!width || !height) return;
      const scale = Math.min(width / STAGE_W, height / STAGE_H).toFixed(4);
      node.style.setProperty("--stage-k", scale);
      node.style.setProperty("--stage-bottom-gap", `${Math.max(0, (height / Number(scale) - STAGE_H) / 2)}px`);
      node.parentElement?.style.setProperty("--stage-k", scale);
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(node);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let api: StageApi | null = null;
    let stopSound: (() => void) | undefined;
    let dead = false;
    const shadow = node.shadowRoot ?? node.attachShadow({ mode: "open" });
    const sheets = STYLES.map((name) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = file(name);
      return link;
    });
    const styled = sheets.map((link) => new Promise<void>((resolve, reject) => {
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`onboarding stage: ${link.href}`));
    }));
    const local = document.createElement("style");
    local.textContent = STAGE_CSS;
    const box = document.createElement("div");
    box.className = "stage";
    shadow.replaceChildren(...sheets, local, box);

    Promise.all([loadEngine(), ...styled]).then(() => {
      if (dead || !window.HerePhone || !window.HereCopy) return;
      applyCopy(window.HereCopy);
      // 무대의 스피커 버튼으로 소리를 끄고 켜면 앱의 효과음 설정도 같이 바뀐다.
      stopSound = window.HereSound?.onChange((on) => setSfxEnabled(on));
      api = window.HerePhone.mount(box, {
        assets: CAT_ART,
        scene: start.current.scene, state: start.current.state, initial: start.current.initial, scenes: start.current.scenes,
        actions: { signOut: () => handlers.current.onSignOut?.(), consent: start.current.consent, noBack: start.current.noBack },
        beforeNext: (snapshot, control) => {
          const saving = handlers.current.beforeNext?.(snapshot);
          if (!saving) return true;
          control.busy(true);
          return saving.then((message) => {
            if (message) { control.fail(message); return false; }
            control.busy(false);
            return true;
          });
        },
        onChange: (snapshot) => {
          if (snapshot.field) setField(snapshot.field);
          setActiveScene(snapshot.scene);
          handlers.current.onChange?.(snapshot);
        },
        onFinish: (snapshot, control) => {
          finishing.current = control;
          handlers.current.onFinish(snapshot);
        },
      });
    }).catch(() => {
      if (!dead) setError("화면을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.");
    });

    return () => {
      dead = true;
      stopSound?.();
      finishing.current = null;
      api?.destroy();
      shadow.replaceChildren();
    };
  }, [attempt]);

  // 저장 상태를 마지막 버튼에 보여 준다.
  useEffect(() => {
    const control = finishing.current;
    if (!control) return;
    if (saving) control.busy(true);
    else if (saveError) control.fail(saveError, "다시 저장");
    else control.busy(false);
  }, [saving, saveError]);

  return (
    <main data-scene={activeScene} className={`app-frame onboarding-stage ${outfit.variable} ${gothicA1.variable}`} style={{ "--stage-field": FIELD[field] } as CSSProperties}>
      <div ref={host} className="onboarding-stage-host" />
      {error && (
        <div className="onboarding-stage-error" role="alert">
          <p className="text-t4 text-pretty">{error}</p>
          <Button tone="ink" onClick={() => { setError(""); setAttempt((n) => n + 1); }}>다시 시도</Button>
        </div>
      )}
    </main>
  );
}
