// localStorage는 계정 프로필의 캐시. 원본은 Supabase 사용자 메타데이터에 저장한다.
// 네 질문의 응답은 서버가 계정에서 읽어 글·음성 공통 프롬프트에 전달한다. 대화 내용은 별도로 전송한다.

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

// 캐릭터 만나기의 짧은 문답. 상담 접수면접 순서(지금 상태 → 찾아온 이유 → 바라는 도움 → 곁에 있는 사람)를 가볍게 따른다.
// 사용자를 유형으로 나누거나 점수를 매기지 않는다(진단 아님). 질문은 서비스 말투, 고른 뒤의 반응(REPLIES)은 고양이 말투다.
// 기준: Notion 'HERE · 온보딩 B안 — 상담 접수 방식 (2026-11-17)', '상담자 기본 원칙 — 시스템 프롬프트용 (2026-11-01)'
export const QUESTIONS = [
  {
    id: "lately",
    text: "요즘 마음은 어때요?",
    options: ["그럭저럭 괜찮아요", "조금 지쳤어요", "많이 힘들어요", "잘 모르겠어요"],
  },
  {
    id: "concern",
    text: "요즘 마음이 가장 많이 가는 건 뭐예요?",
    options: ["일·학업", "사람·관계", "나 자신", "몸·생활", "그냥 이야기하고 싶어요"],
  },
  {
    id: "want",
    text: "여기서 어떤 시간이 되면 좋겠어요?",
    options: ["털어놓고, 들어 주면 좋겠어요", "엉킨 생각을 같이 정리하고 싶어요", "가볍게 이야기 나누고 싶어요", "아직 모르겠어요"],
  },
  {
    id: "support",
    text: "힘들 때 이야기할 수 있는 사람이 있어요?",
    options: ["있어요", "가끔 있어요", "지금은 없어요"],
  },
] as const;

export type QuestionId = (typeof QUESTIONS)[number]["id"];
export type Answers = Partial<Record<QuestionId, string>>;

/** 네 질문의 실제 선택지만 보관한다. 자유 입력·다른 프로필 필드는 제외한다. */
export function pickOnboardingAnswers(raw: unknown): Answers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const answers: Answers = {};
  for (const q of QUESTIONS) {
    const value = source[q.id];
    if (typeof value === "string" && (q.options as readonly string[]).includes(value)) answers[q.id] = value;
  }
  return answers;
}

// 답을 고르면 고양이가 한 줄 받아친다. 말투는 시니컬하게 두되, 시니컬은 고양이 자신·상황에만 쓴다.
// 사용자의 감정·고민을 평가하거나 단정하지 않고, 충고하지 않고, "나한테만 말해" 같은 말을 하지 않는다(상담자 기본 원칙 [2]·[3]·[5]).
// '많이 힘들어요'에는 시니컬을 빼고 짧고 따뜻하게 받는다(원칙 [6]이 우선).
export const REPLIES: Record<QuestionId, Record<string, string>> = {
  lately: {
    "그럭저럭 괜찮아요": "…그럭저럭이면 됐지 뭐. 왔으니까 앉아.",
    "조금 지쳤어요": "지쳤구나. …뭐, 여기까지 버틴 건 인정.",
    "많이 힘들어요": "…그래. 많이 힘들구나. 말해 줘서 고마워.",
    "잘 모르겠어요": "모를 수도 있지. 나도 내 기분 잘 몰라.",
  },
  concern: {
    "일·학업": "일이구나. …얘기 길어지겠네. 일단 앉아.",
    "사람·관계": "사람이 제일 어렵지. …나도 알아.",
    "나 자신": "제일 어려운 상대네. …꺼낸 건 잘했어.",
    "몸·생활": "몸이랑 생활 쪽이구나. …밤낮 바뀐 고양이라 할 말은 없다.",
    "그냥 이야기하고 싶어요": "…심심했구나. 나도 딱히 바쁜 건 아니야.",
  },
  want: {
    "털어놓고, 들어 주면 좋겠어요": "듣는 건 잘해. 고양이니까.",
    "엉킨 생각을 같이 정리하고 싶어요": "엉킨 실 푸는 건 자신 있어. 답은 네가 정해.",
    "가볍게 이야기 나누고 싶어요": "수다? …뭐, 가끔은.",
    "아직 모르겠어요": "몰라도 돼. 일단 들어 줄게. 딱히 할 일도 없고.",
  },
  support: {
    "있어요": "다행이네. …그 사람 얘기도 나중에 해. 궁금한 건 아니고.",
    "가끔 있어요": "가끔이라도 있으면 된 거지. …나쁘지 않네.",
    "지금은 없어요": "…지금은 없구나. 그럼 사람한테 꺼낼 말, 여기서 같이 연습해 보든가.",
  },
};

export function replyLine(id: QuestionId, option: string) {
  return REPLIES[id][option] ?? "";
}

// 장면 사이의 고양이 한마디(이름을 알려 줬을 때·약속을 읽었을 때·요약이 맞다/다르다고 했을 때).
export const PROMISE_REPLY = "다 읽었어? …읽었겠지 뭐.";
export const SUMMARY_YES_REPLY = "…역시.";
export const SUMMARY_FIX_REPLY = "흥. 다시 말해 봐.";
export function nameReply(nickname: string) {
  return `${nickname}. …흥, 외워는 둘게.`;
}

// 캐릭터 만나기의 장면 순서. 상담 접수처럼 안내(AI·기록·109)를 맨 앞(promise)에 두고 시작한다.
// 질문 4개 → 데려가기(많이 힘들면 109) → 들은 것 정리·확인 → 이름 짓기에서 끝난다.
export const ONBOARDING_STEPS = ["promise", "name", "birthday", "gender", "q1", "q2", "q3", "q4", "meet", "summary", "naming"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// 캐릭터 만나기(1번 톤 무대)의 첫 화면. 자는 고양이에게 다가가면 고양이가 AI라고 밝히고 뭘 하러 왔는지 묻고, 버튼이 내 대답이 된다.
// 큰 글씨(line)는 고양이의 말, 작은 글씨(note)는 서비스의 안내다. 무대(public/onboarding)의 문구는 여기 값으로 덮어쓴다.
export const STAGE_OPEN = {
  eyebrow: "골목 끝에 누가 웅크리고 있어요",
  line: "…뭐야. 나 AI야. 얘기하러 왔어?",
  note: "사람이 아니라 AI와 이야기하게 돼요.",
  approach: "다가가기",
  cta: "이야기하러 왔어요",
} as const;

// 시작 전 약속: 이야기를 시작하기 전에 AI라는 것·기록·109를 먼저 알린다(동의는 가입할 때 따로 받는다). breaks = 제목 줄마다 낱말 수.
export const STAGE_NOTICE = {
  title: "이야기하기 전에 알아 두세요",
  breaks: [2, 2],
  items: [
    { title: "이 고양이는 AI예요", desc: "들어 주는 건 해요. 진단과 치료는 사람 전문가가 해요." },
    { title: "기록은 이렇게 둬요", desc: "원문은 이 기기에, 동의한 기억은 계정에 둬요. 답변을 만들 때는 AI 서비스로 보내요." },
    { title: "위험한 말이 나오면 109부터", desc: "자살·자해 같은 말이 나오면 답보다 109 안내를 먼저 보여 줘요." },
  ],
  cta: "알겠어요",
  reply: PROMISE_REPLY,
} as const;

// 무대의 장면(차례대로). 만남(open)에서 시작하고, 들은 것 정리는 데려가기(meet) 장면 안에 있다. 생일·성별은 물어야 하는 회원에게만 연다.
export const STAGE_SCENES = ["open", "promise", "name", "birthday", "gender", "q1", "q2", "q3", "q4", "meet", "naming"] as const;
export type StageScene = (typeof STAGE_SCENES)[number];
export const BASICS_SCENES = ["birthday", "gender"] as const;
// 새로 고친 뒤 이어 갈 자리. 생일·성별 값은 이 탭에 남기지 않으므로, 저장 전이면 생일부터 다시 묻고 저장을 마쳤으면 그 두 장면을 건너뛴다.
export function resumeStep(step: OnboardingStep, askBasics: boolean): OnboardingStep {
  const at = ONBOARDING_STEPS.indexOf(step);
  if (askBasics) return at > ONBOARDING_STEPS.indexOf("name") ? "birthday" : step;
  return step === "birthday" || step === "gender" ? "q1" : step;
}
// 무대의 장면 → 하던 자리(step). 새로 고치면 그 자리의 장면부터 다시 연다.
export function stepOfScene(scene: string): OnboardingStep {
  return scene === "open" ? "promise" : (ONBOARDING_STEPS as readonly string[]).includes(scene) ? (scene as OnboardingStep) : "promise";
}
// 하던 자리 → 무대에서 열 장면. 처음(promise)이면 만남부터, 들은 것 정리(summary)는 데려가기의 끝 상태로 연다.
export function sceneOfStep(step: OnboardingStep, preview = false): { scene: StageScene; state?: string } {
  if (step === "promise") return { scene: preview ? "promise" : "open" };
  if (step === "summary") return { scene: "meet", state: "heard" };
  return { scene: step };
}
// 질문 장면과 질문의 짝
export const QUESTION_STEPS = { q1: "lately", q2: "concern", q3: "want", q4: "support" } as const satisfies Partial<Record<OnboardingStep, QuestionId>>;

// 계정 프로필에는 화면 문구 대신 짧은 값으로 남긴다(문구를 고쳐도 저장 값은 그대로).
// 네 질문의 원래 선택은 onboardingAnswers에 별도로 보관한다. 아래 ID는 기존 화면과의 호환용이다.
export const CONCERN_IDS = { "일·학업": "work", "사람·관계": "relationship", "나 자신": "self", "몸·생활": "life", "그냥 이야기하고 싶어요": "just_talk" } as const;
export const SUPPORT_IDS = { "있어요": "has", "가끔 있어요": "sometimes", "지금은 없어요": "none" } as const;
export type ConcernId = (typeof CONCERN_IDS)[keyof typeof CONCERN_IDS];
export type SupportId = (typeof SUPPORT_IDS)[keyof typeof SUPPORT_IDS];
const CONCERN_VALUES = Object.values(CONCERN_IDS) as readonly string[];
const SUPPORT_VALUES = Object.values(SUPPORT_IDS) as readonly string[];
export function concernId(answer?: string): ConcernId | undefined {
  return answer ? (CONCERN_IDS as Record<string, ConcernId>)[answer] : undefined;
}
export function supportId(answer?: string): SupportId | undefined {
  return answer ? (SUPPORT_IDS as Record<string, SupportId>)[answer] : undefined;
}

// 들은 것 정리(요약·확인): 고른 답을 되짚기만 하고 해석·진단을 덧붙이지 않는다(원칙 [2] 요약하고 빠진 것 묻기).
const SUMMARY_LATELY: Record<string, string> = {
  "그럭저럭 괜찮아요": "그럭저럭 괜찮고",
  "조금 지쳤어요": "조금 지쳐 있고",
  "많이 힘들어요": "많이 힘들고",
  "잘 모르겠어요": "마음이 어떤지 잘 모르겠고",
};
const SUMMARY_CONCERN: Record<string, string> = {
  "일·학업": "일이나 공부에 마음이 많이 가 있고",
  "사람·관계": "사람 사이 일에 마음이 많이 가 있고",
  "나 자신": "너 자신에 대한 생각이 많고",
  "몸·생활": "몸이랑 생활 쪽이 신경 쓰이고",
  "그냥 이야기하고 싶어요": "딱히 뭐가 있다기보다 그냥 얘기하고 싶고",
};
const SUMMARY_WANT: Record<string, string> = {
  "털어놓고, 들어 주면 좋겠어요": "들어 주길 바라는 거지",
  "엉킨 생각을 같이 정리하고 싶어요": "엉킨 생각을 같이 정리하고 싶은 거지",
  "가볍게 이야기 나누고 싶어요": "가볍게 얘기하고 싶은 거지",
  "아직 모르겠어요": "뭘 바라는지는 아직 모르는 거지",
};

export function summaryLine(nickname: string, answers: Answers) {
  const parts = [
    answers.lately && SUMMARY_LATELY[answers.lately],
    answers.concern && SUMMARY_CONCERN[answers.concern],
  ].filter(Boolean);
  const want = answers.want && SUMMARY_WANT[answers.want];
  const who = nickname ? `${josa(nickname, "은", "는")} ` : "";
  const heard = [parts.length ? `요즘 ${parts.join(", ")}` : "", want ? `여기선 ${want}` : ""].filter(Boolean).join(", ");
  return `${heard ? `${who}${heard}. ` : ""}…맞아? 틀렸으면 말해. 고양이도 틀릴 때 있어.`;
}

// tell: 첫 만남 화면에서 캐릭터의 퉁명한 첫마디 아래 서비스가 조용히 덧붙이는 한 줄(고른 대화 방식).
const STYLES = {
  listen: { name: "차분히 들어 주는 친구", line: "서두르지 않고, 천천히 들어 줄게요.", tell: "조용히 들어 줄 거래요." },
  sort: { name: "같이 정리해 주는 친구", line: "엉킨 생각을 하나씩 같이 풀어 볼게요.", tell: "같이 정리해 줄 거래요." },
  chat: { name: "편하게 수다 떠는 친구", line: "무겁지 않게, 아무 이야기나 편하게 해요.", tell: "편하게 수다 떨어 줄 거래요." },
} as const;

export type StyleId = keyof typeof STYLES;

// 질문 3(바라는 것)으로 대화 방식을 정한다. '아직 모르겠어요'는 듣기로 시작하고, 많이 힘든 날엔 수다 대신 듣기로 바꾼다.
export function matchStyle(answers: Answers): StyleId {
  if (answers.want === "엉킨 생각을 같이 정리하고 싶어요") return "sort";
  if (answers.want === "가볍게 이야기 나누고 싶어요" && answers.lately !== "많이 힘들어요") return "chat";
  return "listen";
}

const LATELY_LINE: Record<string, string> = {
  "그럭저럭 괜찮아요": "그럭저럭 지내고 있군요.",
  "조금 지쳤어요": "요즘 조금 지쳐 있었군요.",
  "많이 힘들어요": "요즘 많이 힘들었군요.",
  "잘 모르겠어요": "요즘 마음이 어떤지 잘 모르겠군요. 그럴 수 있어요.",
};

// 데려가기 장면에서 고양이의 첫마디. 질문 1(요즘 마음은 어때요?) 답에 맞춰 말투의 세기를 조절한다.
// 사용자의 상태를 단정하는 말("피곤해 보이네")은 쓰지 않는다(상담자 기본 원칙 [2]).
// "많이 힘들어요"면 퉁명한 말 대신 쉬라고 말하고(tough), 화면은 109 안내를 그 자리에서 바로 보여 준다.
// 문구는 시안 초안이며 팀 확인 전이다.
const MEET_LINE: Record<string, string> = {
  "그럭저럭 괜찮아요": "…뭘 봐.",
  "조금 지쳤어요": "…따라올 거면 오든가.",
  "많이 힘들어요": "…오늘은 좀 쉬어. 대신 이건 알아 둬.",
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
  concern?: ConcernId; // 질문 2의 기존 저장 ID.
  support?: SupportId; // 질문 4의 기존 저장 ID.
  onboardingAnswers?: Answers; // 네 질문에서 사용자가 선택한 원래 응답.
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
    const onboardingAnswers = pickOnboardingAnswers(p.onboardingAnswers);
    return {
      ...(Object.keys(onboardingAnswers).length ? { onboardingAnswers } : {}),
      nickname: typeof p.nickname === "string" ? p.nickname.trim().slice(0, 20) : "",
      companion: cleanName(p.companion),
      shape: SHAPES.some(x => x.id === p.shape) ? p.shape : "cloud",
      color: COLORS.some(x => x.id === p.color) ? p.color : "lavender",
      voice: VOICES.some(x => x.id === p.voice) ? p.voice : "cedar",
      style: isStyleId(p.style) ? p.style : "listen",
      ...(typeof p.accessory === "string" && /^[a-z-]{1,40}$/.test(p.accessory) ? { accessory: p.accessory } : {}),
      ...(CONCERN_VALUES.includes(p.concern) ? { concern: p.concern as ConcernId } : {}),
      ...(SUPPORT_VALUES.includes(p.support) ? { support: p.support as SupportId } : {}),
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
    // 고양이 이름은 마지막 장면에서 처음 짓는다(기본값을 미리 채우지 않는다).
    const companion = typeof d.companion === "string" ? d.companion.slice(0, 10) : "";
    // 답은 지금 질문의 선택지에 있는 것만 되살린다(선택지가 바뀌었으면 그 질문부터 다시).
    const answers: Answers = {};
    for (const q of QUESTIONS) {
      const value = d.answers?.[q.id];
      if (typeof value === "string" && (q.options as readonly string[]).includes(value)) answers[q.id] = value;
    }
    // 앞 장면에서 정한 것이 비어 있으면 그 장면으로 돌아간다.
    let step: OnboardingStep = d.step;
    const at = (s: OnboardingStep) => ONBOARDING_STEPS.indexOf(s);
    const i = at(step);
    if (i > at("name") && !cleanNickname(nickname)) step = "name";
    else if (i > at("q1") && !answers.lately) step = "q1";
    else if (i > at("q2") && !answers.concern) step = "q2";
    else if (i > at("q3") && !answers.want) step = "q3";
    else if (i > at("q4") && !answers.support) step = "q4";
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
