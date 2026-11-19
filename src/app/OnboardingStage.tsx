"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  DEFAULT_COMPANION,
  QUESTIONS,
  REPLIES,
  STAGE_NOTICE,
  STAGE_OPEN,
  type Answers,
  type StageScene,
  meetLine,
  nameReply,
  summaryLine,
} from "@/lib/onboarding";
import { SFX_KEY, setSfxEnabled } from "@/lib/sfx";
import { firstFamily, gothicA1, outfit } from "./onboarding-fonts";
import { Button } from "./ui/Button";
import "./onboarding-stage.css";

// 캐릭터 만나기의 무대(1번 톤). 시안에서 만든 화면을 그대로 올린다: public/onboarding의 스크립트가 장면·동작·소리를 맡고,
// 이 컴포넌트는 그것을 섀도 루트 안에 세워 앱의 스타일과 섞이지 않게 한 뒤, 문구와 값(하던 자리·저장 상태)을 이어 준다.
// 무대는 390×844 기준으로 그려지고, 이 칸의 크기에 맞게 한 비율로 줄거나 늘어난다(둘레에 남는 띠는 장면의 바탕색).
// 무대 파일을 고치면 STAGE_VERSION을 올린다(브라우저가 옛 파일을 붙잡지 않게).
const STAGE_BASE = "/onboarding/";
const STAGE_VERSION = "2026-11-19";
const SCRIPTS = ["copy.js", "cat.js", "sound.js", "phone.js", "scenes/promise.js", "scenes/q2.js", "scenes/q4.js", "scenes/meet.js"];
const STYLES = ["phone.css", "scenes/promise.css", "scenes/q2.css", "scenes/q4.css", "scenes/meet.css"];
const CAT_ART = "/characters/motion/"; // 고양이 그림은 홈과 같은 파일을 쓴다(앉은 그림·걷는 그림만 더했다)
const STAGE_W = 390;
const STAGE_H = 844;
const file = (name: string) => `${STAGE_BASE}${name}?v=${STAGE_VERSION}`;

export type StageField = "yellow" | "lilac" | "orange";
export type StageSnapshot = { scene: StageScene | "done"; field: StageField | null; nickname: string; companion: string; answers: Record<string, unknown> };
export type StageStart = { nickname?: string; companion?: string; answers?: Answers };
const FIELD: Record<StageField, string> = { yellow: "#FDE249", lilac: "#DDC1FF", orange: "#FE6F42" };

/** 마지막 버튼의 진행·실패 표시(무대가 넘겨준다). */
type FinishControl = { busy(on: boolean): void; fail(message: string, retryLabel?: string): void };
type StageApi = { destroy(): void };
type StageEngine = {
  mount(host: HTMLElement, options: {
    assets: string; scene?: string; state?: string; initial?: StageStart;
    onChange?: (snapshot: StageSnapshot) => void;
    onFinish?: (snapshot: StageSnapshot, control: FinishControl) => void;
  }): StageApi;
};
type StageCopy = {
  open: Record<string, unknown>;
  notice?: unknown;
  Q: unknown;
  REPLIES: unknown;
  meet: { line: (answers: Answers) => string };
  summary: (nickname: string, answers: Answers) => string;
  name: { reply: (nickname: string) => string };
  naming: { defaultName: string };
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

/** 무대의 문구를 앱의 문구(lib/onboarding.ts)로 덮어쓴다. 질문·대답·요약은 앱이 한곳에서 관리하고 테스트한다. */
function applyCopy(copy: StageCopy) {
  Object.assign(copy.open, STAGE_OPEN);
  copy.notice = { ...STAGE_NOTICE, breaks: [...STAGE_NOTICE.breaks], items: STAGE_NOTICE.items.map((item) => ({ ...item })) };
  copy.Q = Object.fromEntries(QUESTIONS.map((q) => [q.id, { id: q.id, text: q.text, options: [...q.options] }]));
  copy.REPLIES = REPLIES;
  copy.meet.line = (answers) => meetLine(answers).line;
  copy.summary = (nickname, answers) => summaryLine(nickname, answers);
  copy.name.reply = (nickname) => nameReply(nickname);
  copy.naming.defaultName = DEFAULT_COMPANION;
}

/**
 * scene·state·initial은 처음 한 번만 읽는다(무대가 그 뒤의 진행을 맡는다).
 * onFinish는 마지막 버튼('대화 시작하기')을 누를 때마다 불린다. 저장하는 동안(saving)에는 버튼이 잠기고,
 * 실패하면(saveError) 버튼 위에 그 글이 뜨고 버튼이 '다시 저장'이 된다.
 */
export default function OnboardingStage({ scene, state, initial, saving = false, saveError, onChange, onFinish }: {
  scene?: StageScene;
  state?: string;
  initial?: StageStart;
  saving?: boolean;
  saveError?: string;
  onChange?: (snapshot: StageSnapshot) => void;
  onFinish: (snapshot: StageSnapshot) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const start = useRef({ scene, state, initial });
  const handlers = useRef({ onChange, onFinish });
  const finishing = useRef<FinishControl | null>(null);
  const [field, setField] = useState<StageField>("yellow");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { handlers.current = { onChange, onFinish }; });

  // 무대를 이 칸에 맞춘다(가로·세로 중 더 빠듯한 쪽에 맞춰 한 비율로).
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const fit = () => {
      // 칸의 제 크기(배치 기준)로 잰다: 바깥에서 zoom·transform으로 줄여 둔 화면(개발용 펼쳐 보기)에서도 한 번만 줄어든다.
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (!width || !height) return;
      node.style.setProperty("--stage-k", Math.min(width / STAGE_W, height / STAGE_H).toFixed(4));
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
        ...start.current,
        onChange: (snapshot) => {
          if (snapshot.field) setField(snapshot.field);
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
    <main className={`app-frame onboarding-stage ${outfit.variable} ${gothicA1.variable}`} style={{ "--stage-field": FIELD[field] } as CSSProperties}>
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
