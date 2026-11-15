// localStorage는 계정 프로필의 캐시. 원본은 Supabase 사용자 메타데이터에 저장한다.
// 프로필 중 이름은 채팅·음성 설정에, 목소리는 음성 설정에 사용한다. 대화 내용은 답변 생성을 위해 별도로 전송한다.

import { accountKey } from "./local-scope.ts";

// 몽글이 모습: 광택 구름 + 왕눈, 또는 여러 색이 번진 동그라미 + 낙서 얼굴
export const SHAPES = [
  { id: "cloud", label: "구름" },
  { id: "round", label: "동글" },
] as const;

// 몽글이 빛: 구름 몸 아래쪽 색(base)과 그 안에서 번지는 두 색(blob1·blob2), 위쪽 밝은 색(light),
// 버튼에 쓰는 짙은 색(deep, 흰 아이콘이 3:1 넘게 보이는 정도)
export const COLORS = [
  { id: "lavender", label: "라벤더", base: "#B7A6FF", blob1: "#8EB4FF", blob2: "#F6B4E4", light: "#EEE8FF", deep: "#6A55E6" },
  { id: "sky", label: "하늘", base: "#8CC4FF", blob1: "#6F86FF", blob2: "#9DEFE0", light: "#E2F4FF", deep: "#2F6BFF" },
  { id: "mint", label: "민트", base: "#78D8BC", blob1: "#58BDEB", blob2: "#CDEE7C", light: "#E3FFF4", deep: "#128A73" },
  { id: "peach", label: "피치", base: "#FFB08A", blob1: "#FF7EA8", blob2: "#FFE27A", light: "#FFF1E4", deep: "#D8573A" },
] as const;

/** 몽글이 색으로 칠한 둥근 버튼(마이크·보내기) 배경과 그림자 */
export function accentButton(color: ColorId) {
  const c = COLORS.find((x) => x.id === color) ?? COLORS[0];
  return {
    background: `radial-gradient(circle at 34% 26%, rgba(255,255,255,.35), rgba(255,255,255,0) 55%), linear-gradient(160deg, ${c.base} 0%, ${c.deep} 70%)`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,.4), inset 0 -8px 14px rgba(0,0,0,.12), 0 10px 26px ${c.deep}55`,
  };
}

// OpenAI realtime 목소리 중 여섯. 서버도 이 목록에 있는 것만 받는다.
export const VOICES = [
  { id: "marin", label: "마린", desc: "차분하고 따뜻한 목소리" },
  { id: "cedar", label: "시더", desc: "낮고 편안한 목소리" },
  { id: "coral", label: "코랄", desc: "밝고 다정한 목소리" },
  { id: "sage", label: "세이지", desc: "부드럽고 느긋한 목소리" },
  { id: "verse", label: "버스", desc: "또렷하고 담백한 목소리" },
  { id: "alloy", label: "알로이", desc: "잔잔하고 고른 목소리" },
] as const;

export type ShapeId = (typeof SHAPES)[number]["id"];
export type ColorId = (typeof COLORS)[number]["id"];
export type VoiceId = (typeof VOICES)[number]["id"];

// "몽글이 찾기" 짧은 문답. 사용자를 유형으로 나누지 않고, 몽글이가 어떻게 곁에 있을지만 고른다.
export const QUESTIONS = [
  {
    id: "lately",
    text: "요즘 어떻게 지내요?",
    options: ["그럭저럭 지내요", "조금 지쳤어요", "많이 힘들어요", "잘 모르겠어요"],
  },
  {
    id: "want",
    text: "이야기할 때 어떤 게 좋아요?",
    options: ["조용히 들어 주기", "같이 정리해 주기", "가볍게 수다 떨기"],
  },
] as const;

export type Answers = Partial<Record<(typeof QUESTIONS)[number]["id"], string>>;

// 캐릭터 만나기의 장면 순서. 안내(AI·기록·109)는 이야기를 끊지 않도록 맨 끝, 홈으로 가기 직전에 둔다.
export const ONBOARDING_STEPS = ["name", "q1", "q2", "meet", "naming", "safety"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// tell: 첫 만남 화면에서 캐릭터의 퉁명한 첫마디 아래 서비스가 조용히 덧붙이는 한 줄(고른 대화 방식).
const STYLES = {
  listen: { name: "차분히 들어 주는 친구", line: "서두르지 않고, 천천히 들어 줄게요.", tell: "조용히 들어 줄 거래요." },
  sort: { name: "같이 정리해 주는 친구", line: "엉킨 생각을 하나씩 같이 풀어 볼게요.", tell: "같이 정리해 줄 거래요." },
  chat: { name: "편하게 수다 떠는 친구", line: "무겁지 않게, 아무 이야기나 편하게 해요.", tell: "편하게 수다 떨어 줄 거래요." },
} as const;

export type StyleId = keyof typeof STYLES;

export function matchStyle(answers: Answers): StyleId {
  if (answers.want === "같이 정리해 주기") return "sort";
  if (answers.want === "가볍게 수다 떨기" && answers.lately !== "많이 힘들어요") return "chat";
  return "listen";
}

const LATELY_LINE: Record<string, string> = {
  "그럭저럭 지내요": "그럭저럭 지내고 있군요.",
  "조금 지쳤어요": "요즘 조금 지쳐 있었군요.",
  "많이 힘들어요": "요즘 많이 힘들었군요.",
  "잘 모르겠어요": "요즘 마음이 어떤지 잘 모르겠군요. 그럴 수 있어요.",
};

// 첫 대면에서 고양이의 첫마디. 질문 1(요즘 어떻게 지내요?) 답에 맞춰 말투의 세기를 조절한다.
// "많이 힘들어요"면 퉁명한 말 대신 쉬라고 말하고(tough), 화면은 109 안내를 그 자리에서 바로 보여 준다.
// 문구는 시안 초안이며 팀 확인 전이다.
const MEET_LINE: Record<string, string> = {
  "그럭저럭 지내요": "…뭘 봐.",
  "조금 지쳤어요": "…피곤해 보이네.",
  "많이 힘들어요": "…오늘은 좀 쉬어.",
  "잘 모르겠어요": "…그런 날도 있지.",
};
const TOUGH_LATELY = "많이 힘들어요";

export function meetLine(answers: Answers): { line: string; tough: boolean } {
  return { line: (answers.lately && MEET_LINE[answers.lately]) || "…뭘 봐.", tough: answers.lately === TOUGH_LATELY };
}

export function describeStyle(style: StyleId, answers: Answers) {
  const s = STYLES[style];
  const opener = (answers.lately && LATELY_LINE[answers.lately]) || "";
  return { name: s.name, summary: [opener, s.line].filter(Boolean).join(" "), tell: s.tell };
}

export type Profile = {
  nickname: string;
  companion: string;
  shape: ShapeId;
  color: ColorId;
  voice: VoiceId;
  style: StyleId;
  accessory?: string; // 구름 정원에서 연 꾸미기 아이템(없으면 맨몸)
};

const KEY = "here.profile.v1";
// 처음 만날 때의 기본 이름. 온보딩 마지막에 사용자가 바꿀 수 있다(예전 기본값은 "몽글이").
export const DEFAULT_COMPANION = "호야";

// 몽글이 이름은 지시문에 들어가니 한글·영문·숫자·띄어쓰기만, 10자까지.
export function cleanName(name: string, fallback = DEFAULT_COMPANION) {
  const s = name.replace(/\s+/g, " ").replace(/[^가-힣a-zA-Z0-9 ]/g, "").trim().slice(0, 10);
  return s || fallback;
}

// 사용자가 불러 달라고 한 이름(온보딩 첫 단계). AI 지시문에 들어가니 글자(결합 부호 포함)·숫자·띄어쓰기만 남기고 12자까지(입력칸과 같은 길이).
// NFC로 맞추고, 보이지 않는 글자(한글 채움 문자·변형 선택자 등)와 글자 뒤가 아닌 결합 부호는 지운다. 따옴표·줄바꿈·#·이모지는 남지 않는다.
// 다 지워지면 빈 문자열이고, 그때는 AI에 이름을 넘기지 않는다(이름 단계도 이 기준으로 막는다). 친구에게 보이는 이름(friends.ts)과는 따로 거른다.
export function cleanNickname(name: unknown): string {
  if (typeof name !== "string") return "";
  const s = name.normalize("NFC")
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .replace(/[^\p{L}\p{M}\p{N}\s]|\p{Me}/gu, "")
    .replace(/(?<![\p{L}\p{M}])\p{M}+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...s].slice(0, 12).join("").trim();
}

export const STYLE_IDS = ["listen", "sort", "chat"] as const satisfies readonly StyleId[];
export function isStyleId(value: unknown): value is StyleId {
  return typeof value === "string" && (STYLE_IDS as readonly string[]).includes(value);
}

/** 이름 뒤 조사: josa("하늘", "이", "가") → "하늘이", josa("몽글이", "이", "가") → "몽글이가". 받침이 없거나 한글이 아니면 뒤엣것. */
export function josa(word: string, withFinal: string, without: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 ? withFinal : without);
}

/** 저장된 원문(없으면 null). useSyncExternalStore가 같은 값을 돌려받도록 문자열 그대로 준다. */
export function profileRaw(): string | null {
  const key = accountKey(KEY);
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function parseProfile(raw: string | null): Profile | null {
  try {
    const p = JSON.parse(raw ?? "null");
    if (!p || typeof p.companion !== "string" || !p.companion.trim()) return null;
    return {
      nickname: typeof p.nickname === "string" ? p.nickname.trim().slice(0, 20) : "",
      companion: cleanName(p.companion),
      shape: SHAPES.some(x => x.id === p.shape) ? p.shape : "cloud",
      color: COLORS.some(x => x.id === p.color) ? p.color : "lavender",
      voice: VOICES.some(x => x.id === p.voice) ? p.voice : "cedar",
      style: isStyleId(p.style) ? p.style : "listen",
      ...(typeof p.accessory === "string" && /^[a-z-]{1,40}$/.test(p.accessory) ? { accessory: p.accessory } : {}),
    };
  } catch {
    return null;
  }
}

export function loadProfile(): Profile | null {
  return parseProfile(profileRaw());
}

/** 처음부터 다시 하기: 몽글이 설정만 지운다(대화 기록은 log.ts가 따로 둔다) */
export function clearProfile() {
  const key = accountKey(KEY);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function saveProfile(p: Profile) {
  const key = accountKey(KEY);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(p));
  } catch {
    // 저장소를 못 쓰면 다음에 열 때 온보딩을 다시 본다.
  }
}

// 캐릭터 만나기를 하던 자리. 새로 고침·탭이 내려간 뒤(109 전화를 걸고 돌아왔을 때 등)에도 이어 가도록
// 이 탭의 sessionStorage에만 계정별로 잠깐 둔다. 탭을 닫거나 마지막 안내에서 '알겠어요'를 누르면 지운다.
const DRAFT_KEY = "here.onboarding-draft.v1";

export type OnboardingDraft = { step: OnboardingStep; nickname: string; answers: Answers; companion: string };

export function parseOnboardingDraft(raw: string | null): OnboardingDraft | null {
  try {
    const d = JSON.parse(raw ?? "null");
    if (!d || typeof d !== "object" || !(ONBOARDING_STEPS as readonly unknown[]).includes(d.step)) return null;
    const nickname = typeof d.nickname === "string" ? d.nickname.slice(0, 12) : "";
    const companion = typeof d.companion === "string" ? d.companion.slice(0, 10) : DEFAULT_COMPANION;
    // 답은 지금 질문의 선택지에 있는 것만 되살린다(선택지가 바뀌었으면 그 질문부터 다시).
    const answers: Answers = {};
    for (const q of QUESTIONS) {
      const value = d.answers?.[q.id];
      if (typeof value === "string" && (q.options as readonly string[]).includes(value)) answers[q.id] = value;
    }
    // 앞 장면에서 정한 것이 비어 있으면 그 장면으로 돌아간다.
    let step: OnboardingStep = d.step;
    const i = ONBOARDING_STEPS.indexOf(step);
    if (i > 0 && !cleanNickname(nickname)) step = "name";
    else if (i > 1 && !answers.lately) step = "q1";
    else if (i > 2 && !answers.want) step = "q2";
    return { step, nickname, answers, companion };
  } catch {
    return null;
  }
}

export function loadOnboardingDraft(): OnboardingDraft | null {
  const key = accountKey(DRAFT_KEY);
  if (!key) return null;
  try {
    return parseOnboardingDraft(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft) {
  const key = accountKey(DRAFT_KEY);
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // 저장소를 못 쓰면 새로 고칠 때 처음부터 다시 본다.
  }
}

export function clearOnboardingDraft() {
  const key = accountKey(DRAFT_KEY);
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch {}
}
