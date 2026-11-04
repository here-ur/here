import test from "node:test";
import assert from "node:assert/strict";
import { setLocalOwner } from "./local-scope.ts";
import type { DayStat } from "./report.ts";
import { COLLECTION_SIZE, LEVELS, SEEDS, buildGarden, dailySeeds, dayTopics, loadSeeds, pickSeed, speciesName } from "./garden.ts";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;
setLocalOwner("member-a");

const day = (date: string, words: Record<string, number>, patch: Partial<DayStat> = {}): DayStat => ({ date, said: 3, replies: 3, hours: Array(24).fill(0), words, crisis: false, ...patch });
const NOW = new Date(2026, 10, 10, 12).getTime(); // 2026-11-10

test("그날 자주 한 말에서 주제를 찾고, 위기 표현이 있던 날은 쓰지 않는다", () => {
  assert.deepEqual(dayTopics(day("2026-11-01", { 회의: 2, 친구: 1, 보리차: 1 })), ["work", "people"]);
  assert.deepEqual(dayTopics(day("2026-11-01", { 회의: 2 }, { crisis: true })), []);
});

test("같은 날 같은 주제는 식물 하나, 날이 지나면 자라고, 줄지 않는다", () => {
  const garden = buildGarden([
    day("2026-11-01", { 회의: 2, 업무: 1 }, { ai: "rain" }),
    day("2026-11-09", { 친구: 1 }, { ai: "sunny" }),
    day("2026-11-10", { 게임: 1 }),
    day("2026-11-05", { 회의: 1 }, { crisis: true }),
  ], {}, NOW);
  assert.deepEqual(garden.plants.map((p) => [p.date, p.topic, p.stage]), [["2026-11-01", "work", 3], ["2026-11-09", "people", 1], ["2026-11-10", "likes", 1]]);
  assert.equal(garden.weather, "sunny"); // 어제 하늘이 오늘 정원 날씨
  assert.deepEqual([...garden.collected].sort(), ["people:sunny", "work:rain"]);
  assert.equal(garden.level.level, 1);
  assert.equal(garden.toNext, 2);
});

test("씨앗을 고른 날 이야기했으면 단어가 없어도 그 주제로 심고, 이야기 안 한 날은 심지 않는다", () => {
  const garden = buildGarden([day("2026-11-08", {}), day("2026-11-07", {}, { said: 0 })], { "2026-11-08": "tasty", "2026-11-07": "friend" }, NOW);
  assert.deepEqual(garden.plants.map((p) => [p.topic, p.fromSeed]), [["likes", true]]);
});

test("어제 위기 표현이 있었다면 정원 날씨로 쓰지 않는다", () => {
  assert.equal(buildGarden([day("2026-11-09", {}, { ai: "rain", crisis: true })], {}, NOW).weather, null);
});

test("섬 레벨은 식물 수로만 오르고 마지막 단계에서는 다음이 없다", () => {
  const many = Array.from({ length: 45 }, (_, i) => day(`2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`, { 회의: 1 }));
  const garden = buildGarden(many, {}, NOW);
  assert.equal(garden.level.level, LEVELS.at(-1)!.level);
  assert.equal(garden.next, null);
  assert.equal(garden.progress, 1);
});

test("씨앗은 날짜마다 같은 3개가 겹치지 않게 나오고, 고른 씨앗은 계정별로 남는다", () => {
  const a = dailySeeds("2026-11-10");
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((s) => s.id)).size, 3);
  assert.deepEqual(dailySeeds("2026-11-10"), a);
  pickSeed(SEEDS[0].id, NOW);
  assert.deepEqual(loadSeeds(), { "2026-11-10": SEEDS[0].id });
  pickSeed("unknown", NOW);
  assert.deepEqual(loadSeeds(), { "2026-11-10": SEEDS[0].id });
  setLocalOwner("member-b");
  assert.deepEqual(loadSeeds(), {});
  setLocalOwner("member-a");
});

test("도감 이름은 날씨와 식물로 만들고 칸 수는 주제×하늘이다", () => {
  assert.equal(speciesName("people", "rain"), "비 오는 날 꽃");
  assert.equal(COLLECTION_SIZE, 30);
});

test("꾸미기 아이템은 섬 레벨과 도감으로 열리고, 새싹 핀은 처음부터 있다", async () => {
  const { unlockedAccessories, LEVELS: levels } = await import("./garden.ts");
  const at = (level: number, collected: number) => ({ level: levels[level - 1], collected: new Set(Array.from({ length: collected }, (_, i) => `k${i}`)) });
  assert.deepEqual([...unlockedAccessories(at(1, 0))], ["sprout"]);
  assert.deepEqual([...unlockedAccessories(at(3, 0))], ["sprout", "hat", "scarf"]);
  assert.ok(unlockedAccessories(at(1, 15)).has("rainbow"));
  assert.equal(unlockedAccessories(at(5, 14)).has("rainbow"), false);
});

test("계절은 3·6·9·12월에 바뀌고, 1·2월은 앞 해 겨울이다", async () => {
  const { seasonOf } = await import("./garden.ts");
  assert.equal(seasonOf(new Date(2026, 2, 1).getTime()).id, "spring");
  assert.equal(seasonOf(new Date(2026, 10, 30).getTime()).id, "autumn");
  const winter = seasonOf(new Date(2027, 1, 10).getTime());
  assert.deepEqual([winter.id, winter.year], ["winter", 2026]);
  assert.equal(new Date(winter.end).getMonth(), 1); // 2월 말까지
});

test("앨범은 지난 계절마다 그 계절 마지막 날 모습으로 남고, 지금 계절은 빠진다", async () => {
  const { gardenAlbum } = await import("./garden.ts");
  const album = gardenAlbum([
    day("2026-07-10", { 친구: 1 }),
    day("2026-10-01", { 회의: 1 }),
    day("2026-10-02", { 게임: 1 }),
    day("2026-12-05", { 산책: 1 }),
  ], {}, new Date(2026, 11, 20).getTime());
  assert.deepEqual(album.map((p) => [p.label, p.garden.plants.length]), [["2026 가을", 3], ["2026 여름", 1]]);
  assert.ok(album[0].garden.plants.every((p) => p.stage >= 2)); // 계절 끝 기준으로 자란 모습
});

test("3D 장면에는 레벨·날씨·계절·꾸미기·주제별 식물 수만 넘긴다", async () => {
  const { splineVariables } = await import("./garden.ts");
  const garden = buildGarden([day("2026-11-09", { 친구: 1, 회의: 1 }, { ai: "rain" })], {}, NOW);
  assert.deepEqual(splineVariables(garden, "autumn", "hat"), {
    level: 1, plants: 2, collected: 2, weather: "rain", season: "autumn", accessory: "hat",
    work: 1, people: 1, rest: 0, likes: 0, thoughts: 0,
  });
  assert.equal(splineVariables(garden, "autumn", "unknown").accessory, "");
});
