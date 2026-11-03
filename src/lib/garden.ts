// 구름 정원: 이야기한 날의 주제가 식물로 자라고, 어제 하늘이 오늘 정원 날씨가 된다.
// 모두 이 기기에서만 센다. 리포트 숫자(날짜별 자주 한 말 상위 20개)만 쓰고, 원문이나 AI는 쓰지 않는다.
// 쉬어도 시들지 않는다: 식물이 줄거나 레벨이 내려가는 일은 없다(연속 기록·벌칙 없음).
import { accountKey } from "./local-scope.ts";
import { type DayStat, type SkyId, SKIES, effectiveSky, localDate } from "./report.ts";

export type TopicId = "work" | "people" | "rest" | "likes" | "thoughts";

// 주제는 내 성격이 아니라 '무슨 이야기를 했는지'다. 병명·증상 같은 민감어는 리포트에서 이미 빠진다.
export const TOPICS: { id: TopicId; label: string; plant: string; words: string[] }[] = [
  { id: "work", label: "일·공부", plant: "나무", words: ["일", "회사", "회의", "업무", "출근", "퇴근", "야근", "팀장님", "부장님", "과장님", "상사", "프로젝트", "기획안", "보고서", "발표", "공부", "시험", "과제", "학교", "수업", "숙제", "면접", "취업", "알바"] },
  { id: "people", label: "사람·관계", plant: "꽃", words: ["친구", "엄마", "아빠", "부모님", "가족", "동생", "언니", "오빠", "누나", "형", "할머니", "할아버지", "남자친구", "여자친구", "애인", "남편", "아내", "동료", "선배", "후배", "사람", "아이", "우리"] },
  { id: "rest", label: "쉼·몸", plant: "이끼", words: ["잠", "낮잠", "휴식", "산책", "운동", "요가", "헬스", "수영", "목욕", "주말", "휴가", "쉬는", "침대", "스트레칭", "달리기"] },
  { id: "likes", label: "좋아하는 것", plant: "열매", words: ["게임", "영화", "음악", "노래", "책", "커피", "차", "음식", "맛집", "카페", "여행", "드라마", "웹툰", "만화", "고양이", "강아지", "그림", "사진", "요리", "빵", "케이크", "보드게임"] },
  { id: "thoughts", label: "생각·하루", plant: "버섯", words: ["생각", "하루", "오늘", "어제", "내일", "요즘", "기분", "마음", "계획", "목표", "꿈", "일기", "고민"] },
];

const TOPIC_OF = new Map(TOPICS.flatMap((t) => t.words.map((w) => [w, t.id] as const)));

/** 그날 이야기에 나온 주제. 위기 표현이 있던 날은 정원에 쓰지 않는다. */
export function dayTopics(day: DayStat): TopicId[] {
  if (day.crisis) return [];
  const found = new Set<TopicId>();
  for (const word of Object.keys(day.words)) {
    const topic = TOPIC_OF.get(word);
    if (topic) found.add(topic);
  }
  return TOPICS.map((t) => t.id).filter((id) => found.has(id));
}

// 어떤 하늘도 정원에 쓸모가 있다. 정원 날씨는 어제 하늘이다.
export const WEATHER: Record<SkyId, { adj: string; gift: string }> = {
  sunny: { adj: "맑은 날", gift: "햇살을 받아 꽃이 활짝 피었어요" },
  cozy: { adj: "포근한 날", gift: "따뜻해서 열매가 동그랗게 익었어요" },
  cloudy: { adj: "흐린 날", gift: "그늘에서 이끼가 촉촉하게 자랐어요" },
  rain: { adj: "비 오는 날", gift: "비가 와서 새싹이 쑥쑥 자랐어요" },
  thunder: { adj: "천둥 친 날", gift: "천둥 덕분에 뿌리가 깊어졌어요" },
  wind: { adj: "바람 분 날", gift: "바람이 씨앗을 섬 끝까지 날려 줬어요" },
};

export type Plant = { date: string; topic: TopicId; sky?: SkyId; stage: 1 | 2 | 3; fromSeed: boolean };

export const LEVELS = [
  { level: 1, name: "작은 구름", from: 0 },
  { level: 2, name: "구름 언덕", from: 5 },
  { level: 3, name: "구름 숲", from: 12 },
  { level: 4, name: "큰 구름 섬", from: 24 },
  { level: 5, name: "하늘 정원", from: 40 },
] as const;

export type Garden = {
  plants: Plant[];
  level: (typeof LEVELS)[number];
  next: (typeof LEVELS)[number] | null;
  toNext: number; // 다음 섬 모양까지 남은 식물 수
  progress: number; // 0~1
  weather: SkyId | null; // 오늘 정원 날씨(어제 하늘)
  collected: Set<string>; // `${topic}:${sky}` 도감 칸
};

export const COLLECTION_SIZE = TOPICS.length * SKIES.length;
export const speciesKey = (topic: TopicId, sky: SkyId) => `${topic}:${sky}`;
export const speciesName = (topic: TopicId, sky: SkyId) => `${WEATHER[sky].adj} ${TOPICS.find((t) => t.id === topic)!.plant}`;

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / DAY_MS);

/** 오늘 정원 날씨 = 어제 하늘. 위기 표현이 있던 날이면 없음. */
export function gardenWeather(days: DayStat[], now = Date.now()): SkyId | null {
  const yesterday = days.find((d) => d.date === localDate(now - DAY_MS));
  return yesterday && !yesterday.crisis ? effectiveSky(yesterday) ?? null : null;
}

/** 날짜별 숫자와 고른 씨앗으로 정원을 만든다. 같은 날 같은 주제는 식물 하나다. */
export function buildGarden(days: DayStat[], seeds: Record<string, string>, now = Date.now()): Garden {
  const today = localDate(now);
  const plants: Plant[] = [];
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.crisis || day.said <= 0 || day.date > today) continue;
    const topics = new Set(dayTopics(day));
    // 씨앗을 고른 날 이야기했으면, 단어가 안 잡혀도 그 주제로 심는다.
    const seed = SEEDS.find((s) => s.id === seeds[day.date]);
    if (seed) topics.add(seed.topic);
    const age = daysBetween(day.date, today);
    const stage = age >= 7 ? 3 : age >= 2 ? 2 : 1;
    const sky = effectiveSky(day);
    for (const topic of TOPICS.map((t) => t.id).filter((id) => topics.has(id))) {
      plants.push({ date: day.date, topic, sky, stage, fromSeed: seed?.topic === topic });
    }
  }
  const count = plants.length;
  const level = [...LEVELS].reverse().find((l) => count >= l.from)!;
  const next = LEVELS.find((l) => l.from > count) ?? null;
  const toNext = next ? next.from - count : 0;
  const progress = next ? (count - level.from) / (next.from - level.from) : 1;
  const weather = gardenWeather(days, now);
  const collected = new Set(plants.flatMap((p) => (p.sky ? [speciesKey(p.topic, p.sky)] : [])));
  return { plants, level, next, toNext, progress, weather, collected };
}

// 오늘의 이야기 씨앗: 가벼운 일상 주제만. 상처나 고민을 캐묻는 주제는 넣지 않는다.
export const SEEDS: { id: string; label: string; topic: TopicId; opener: string }[] = [
  { id: "tasty", label: "요즘 맛있던 것", topic: "likes", opener: "요즘 먹은 것 중에 제일 맛있었던 거 있어? 나 궁금해!" },
  { id: "laugh", label: "오늘 웃겼던 일", topic: "thoughts", opener: "오늘 조금이라도 웃겼던 일 있었어? 작은 거라도 좋아." },
  { id: "weekend", label: "주말에 하고 싶은 것", topic: "rest", opener: "이번 주말에 딱 하나만 할 수 있다면 뭐 하고 싶어?" },
  { id: "song", label: "요즘 듣는 노래", topic: "likes", opener: "요즘 자주 듣는 노래 있어? 어떤 느낌의 곡이야?" },
  { id: "walk", label: "걷고 싶은 길", topic: "rest", opener: "산책한다면 어디를 걷고 싶어? 좋아하는 길 있어?" },
  { id: "friend", label: "생각나는 사람", topic: "people", opener: "요즘 문득 생각나는 사람 있어? 어떤 사람이야?" },
  { id: "work-small", label: "오늘 해낸 작은 일", topic: "work", opener: "오늘 해낸 일 중에 작지만 뿌듯했던 거 있어?" },
  { id: "place", label: "가 보고 싶은 곳", topic: "likes", opener: "언젠가 꼭 가 보고 싶은 곳 있어? 왜 거기야?" },
  { id: "morning", label: "오늘 아침", topic: "thoughts", opener: "오늘 아침은 어땠어? 일어나서 제일 먼저 한 게 뭐야?" },
  { id: "pet", label: "귀여웠던 것", topic: "likes", opener: "요즘 본 것 중에 제일 귀여웠던 거 알려 줘!" },
  { id: "rest-best", label: "나만의 쉬는 법", topic: "rest", opener: "푹 쉬고 싶을 때 너만의 방법이 있어?" },
  { id: "thanks", label: "고마웠던 사람", topic: "people", opener: "요즘 고마웠던 사람 있어? 무슨 일이 있었어?" },
];

/** 날짜마다 정해지는 씨앗 3개. 같은 날에는 늘 같은 씨앗이 나온다. */
export function dailySeeds(date: string, count = 3) {
  let h = 0;
  for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const picked: typeof SEEDS = [];
  for (let i = 0; picked.length < Math.min(count, SEEDS.length); i++) {
    const seed = SEEDS[(h + i * 7) % SEEDS.length];
    if (!picked.includes(seed)) picked.push(seed);
  }
  return picked;
}

// ── 고른 씨앗 저장: 계정별로 이 기기에만, 1년까지 ──
const KEY = "here.garden.v1";
const KEEP_DAYS = 365;

export function loadSeeds(): Record<string, string> {
  const key = accountKey(KEY);
  if (!key) return {};
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([date, id]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof id === "string" && SEEDS.some((s) => s.id === id)));
  } catch {
    return {};
  }
}

export function pickSeed(seedId: string, now = Date.now()) {
  const key = accountKey(KEY);
  if (!key || !SEEDS.some((s) => s.id === seedId)) return;
  const oldest = localDate(now - KEEP_DAYS * DAY_MS);
  const next = Object.fromEntries(Object.entries(loadSeeds()).filter(([date]) => date >= oldest));
  next[localDate(now)] = seedId;
  try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
}

export function clearSeeds() {
  const key = accountKey(KEY);
  if (key) try { localStorage.removeItem(key); } catch {}
}

// ── 2단계: 몽글이 꾸미기 보상 ──
// 정원이 자라면 열린다. 한번 열린 아이템은 닫히지 않는다(식물이 줄지 않으니까).
export type AccessoryId = "sprout" | "hat" | "scarf" | "flowers" | "crown" | "rainbow";
export const ACCESSORIES: { id: AccessoryId; label: string; unlock: { level?: number; collected?: number }; hint: string }[] = [
  { id: "sprout", label: "새싹 핀", unlock: { level: 1 }, hint: "처음부터 있어요" },
  { id: "hat", label: "빨간 모자", unlock: { level: 2 }, hint: "구름 언덕(Lv.2)에서 열려요" },
  { id: "scarf", label: "포근 목도리", unlock: { level: 3 }, hint: "구름 숲(Lv.3)에서 열려요" },
  { id: "flowers", label: "꽃 화관", unlock: { level: 4 }, hint: "큰 구름 섬(Lv.4)에서 열려요" },
  { id: "crown", label: "구름 왕관", unlock: { level: 5 }, hint: "하늘 정원(Lv.5)에서 열려요" },
  { id: "rainbow", label: "무지개 리본", unlock: { collected: 15 }, hint: "도감 15칸을 채우면 열려요" },
];

export const isAccessoryId = (value: unknown): value is AccessoryId => ACCESSORIES.some((a) => a.id === value);

export function unlockedAccessories(garden: Pick<Garden, "level" | "collected">): Set<AccessoryId> {
  return new Set(ACCESSORIES.filter(({ unlock }) =>
    (unlock.level === undefined || garden.level.level >= unlock.level) && (unlock.collected === undefined || garden.collected.size >= unlock.collected),
  ).map((a) => a.id));
}

// ── 3단계: 계절과 정원 앨범 ──
// 계절마다 섬 풍경이 바뀐다. 지난 계절은 그 계절 마지막 날의 정원 모습으로 앨범에 남는다(식물은 지우지 않는다).
export type SeasonId = "spring" | "summer" | "autumn" | "winter";
export const SEASON_LABEL: Record<SeasonId, string> = { spring: "봄", summer: "여름", autumn: "가을", winter: "겨울" };

/** 3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울. 겨울은 12월이 있는 해로 센다. */
export function seasonOf(ts: number): { id: SeasonId; year: number; start: number; end: number } {
  const d = new Date(ts);
  const m = d.getMonth(); // 0~11
  const y = d.getFullYear();
  const id: SeasonId = m >= 2 && m <= 4 ? "spring" : m >= 5 && m <= 7 ? "summer" : m >= 8 && m <= 10 ? "autumn" : "winter";
  const startMonth = { spring: 2, summer: 5, autumn: 8, winter: 11 }[id];
  const year = id === "winter" && m < 2 ? y - 1 : y;
  const start = new Date(year, startMonth, 1).getTime();
  const end = new Date(year, startMonth + 3, 1).getTime() - 1;
  return { id, year, start, end };
}

export type AlbumPage = { key: string; label: string; season: SeasonId; garden: Garden };

/** 지금 계절 전, 식물이 있던 계절마다 그 계절 마지막 날 정원. 최근 계절이 먼저 온다. */
export function gardenAlbum(days: DayStat[], seeds: Record<string, string>, now = Date.now()): AlbumPage[] {
  const current = seasonOf(now);
  const pages = new Map<string, ReturnType<typeof seasonOf>>();
  for (const day of days) {
    const ts = Date.parse(`${day.date}T12:00:00`);
    if (Number.isNaN(ts) || ts >= current.start) continue;
    const s = seasonOf(ts);
    pages.set(`${s.year}-${s.id}`, s);
  }
  return [...pages.entries()]
    .sort((a, b) => b[1].start - a[1].start)
    .map(([key, s]) => {
      const until = localDate(s.end);
      const garden = buildGarden(days.filter((d) => d.date <= until), seeds, s.end);
      return { key, label: `${s.year} ${SEASON_LABEL[s.id]}`, season: s.id, garden };
    })
    .filter((page) => page.garden.plants.length > 0);
}

// ── 3D 장면(Spline) 연결 ──
// 디자이너가 Spline 파일에 같은 이름의 변수를 만들어 두면, 앱이 정원 상태를 그대로 넣어 준다(docs/GARDEN_SPLINE.md).
export type SplineVariables = {
  level: number; plants: number; collected: number;
  weather: string; season: string; accessory: string;
  work: number; people: number; rest: number; likes: number; thoughts: number;
};

export function splineVariables(garden: Garden, season: SeasonId, accessory?: string): SplineVariables {
  const count = (topic: TopicId) => garden.plants.filter((p) => p.topic === topic).length;
  return {
    level: garden.level.level,
    plants: garden.plants.length,
    collected: garden.collected.size,
    weather: garden.weather ?? "none",
    season,
    accessory: isAccessoryId(accessory) ? accessory : "",
    work: count("work"), people: count("people"), rest: count("rest"), likes: count("likes"), thoughts: count("thoughts"),
  };
}
