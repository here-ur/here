// 온보딩에서 정한 것(부르는 이름, 몽글이 이름·빛·목소리, 곁에 있는 방식)을 이 기기의 localStorage에만 남긴다.
// 서버로 보내는 건 몽글이 이름과 목소리뿐이다(/api/realtime이 받아서 그대로 쓴다).

export const COLORS = [
  { id: "sky", label: "하늘", hue: 0 },
  { id: "lavender", label: "라벤더", hue: 40 },
  { id: "mint", label: "민트", hue: -60 },
  { id: "peach", label: "피치", hue: 170 },
] as const;

// OpenAI realtime 목소리 중 여섯. 서버도 이 목록에 있는 것만 받는다.
export const VOICES = [
  { id: "marin", label: "마린", desc: "차분하고 따뜻한 목소리" },
  { id: "cedar", label: "시더", desc: "낮고 편안한 목소리" },
  { id: "coral", label: "코랄", desc: "밝고 다정한 목소리" },
  { id: "sage", label: "세이지", desc: "부드럽고 느긋한 목소리" },
  { id: "verse", label: "버스", desc: "또렷하고 담백한 목소리" },
  { id: "alloy", label: "알로이", desc: "잔잔하고 고른 목소리" },
] as const;

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

const STYLES = {
  listen: { name: "차분히 들어 주는 친구", line: "서두르지 않고, 네 속도에 맞춰 들어 줄게요." },
  sort: { name: "같이 정리해 주는 친구", line: "엉킨 생각을 하나씩 같이 풀어 볼게요." },
  chat: { name: "편하게 수다 떠는 친구", line: "무겁지 않게, 아무 이야기나 편하게 해요." },
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

export function describeStyle(style: StyleId, answers: Answers) {
  const s = STYLES[style];
  const opener = (answers.lately && LATELY_LINE[answers.lately]) || "";
  return { name: s.name, summary: [opener, s.line].filter(Boolean).join(" ") };
}

export type Profile = {
  nickname: string;
  companion: string;
  color: ColorId;
  voice: VoiceId;
  style: StyleId;
};

const KEY = "here.profile.v1";
export const DEFAULT_COMPANION = "몽글이";

// 몽글이 이름은 지시문에 들어가니 한글·영문·숫자·띄어쓰기만, 10자까지.
export function cleanName(name: string, fallback = DEFAULT_COMPANION) {
  const s = name.replace(/\s+/g, " ").replace(/[^가-힣a-zA-Z0-9 ]/g, "").trim().slice(0, 10);
  return s || fallback;
}

/** 이름 뒤 조사: josa("하늘", "이", "가") → "하늘이", josa("몽글이", "이", "가") → "몽글이가". 받침이 없거나 한글이 아니면 뒤엣것. */
export function josa(word: string, withFinal: string, without: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 ? withFinal : without);
}

/** 저장된 원문(없으면 null). useSyncExternalStore가 같은 값을 돌려받도록 문자열 그대로 준다. */
export function profileRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function parseProfile(raw: string | null): Profile | null {
  try {
    const p = JSON.parse(raw ?? "null");
    return p && typeof p.companion === "string" ? p : null;
  } catch {
    return null;
  }
}

export function loadProfile(): Profile | null {
  return parseProfile(profileRaw());
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 저장소를 못 쓰면 다음에 열 때 온보딩을 다시 본다.
  }
}
