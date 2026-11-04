"use client";

import { useState } from "react";
import { ACCESSORIES, LEVELS, type SeasonId, buildGarden } from "@/lib/garden";
import { COLORS, type ColorId } from "@/lib/onboarding";
import { type DayStat, type SkyId, SKIES } from "@/lib/report";
import Garden3D from "../../Garden3D";

// three.js 3D 정원 시제품 확인 화면. 레벨·날씨·계절·색·꾸미기를 바꿔 보며 품질을 판단한다.
const NOW = new Date(2026, 10, 10, 12).getTime();
const WORDS: Record<string, number>[] = [{ 회의: 2 }, { 친구: 1 }, { 산책: 1 }, { 게임: 1 }, { 생각: 1 }, { 회의: 1, 친구: 1, 게임: 1 }];
const SKY_CYCLE: SkyId[] = ["sunny", "rain", "cloudy", "cozy", "wind", "thunder"];

function sampleDays(count: number): DayStat[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(2026, 10, 9 - i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { date, said: 3, replies: 3, hours: Array(24).fill(0), words: WORDS[i % WORDS.length], crisis: false, ai: SKY_CYCLE[i % SKY_CYCLE.length] };
  });
}

const select = "h-10 rounded-r3 bg-white px-2 text-t3 text-[#1F2A55] shadow-[0_1px_4px_rgba(28,38,80,.08)]";

export default function Preview() {
  const [level, setLevel] = useState(3);
  const [weather, setWeather] = useState<SkyId | "none">("sunny");
  const [season, setSeason] = useState<SeasonId>("autumn");
  const [color, setColor] = useState<ColorId>("lavender");
  const [accessory, setAccessory] = useState("hat");
  // 고른 레벨에 닿을 때까지 예시 날짜를 늘린다.
  let count = 1;
  while (count < 60 && buildGarden(sampleDays(count), {}, NOW).level.level < level) count++;
  const garden = buildGarden(sampleDays(count), {}, NOW);
  return (
    <main className="app-frame app-frame-scrollable bg-[#FAFCFE] px-gutter py-6 text-[#1F2A55]">
      <h1 className="text-t6 font-bold">3D 구름 정원 시제품</h1>
      <p className="mt-1 text-t2 text-[#5A6478]">손가락으로 좌우로 돌려 볼 수 있어요. 레벨 {garden.level.level} · {garden.level.name} · 식물 {garden.plants.length}개</p>
      <div className="mt-4"><Garden3D garden={garden} season={season} weather={weather === "none" ? null : weather} color={color} accessory={accessory || undefined} /></div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-t2">레벨<select className={select} value={level} onChange={(e) => setLevel(Number(e.target.value))}>{LEVELS.map((l) => <option key={l.level} value={l.level}>Lv.{l.level} {l.name}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-t2">날씨<select className={select} value={weather} onChange={(e) => setWeather(e.target.value as SkyId | "none")}><option value="none">없음</option>{SKIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-t2">계절<select className={select} value={season} onChange={(e) => setSeason(e.target.value as SeasonId)}><option value="spring">봄</option><option value="summer">여름</option><option value="autumn">가을</option><option value="winter">겨울</option></select></label>
        <label className="flex flex-col gap-1 text-t2">몽글이 빛<select className={select} value={color} onChange={(e) => setColor(e.target.value as ColorId)}>{COLORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label className="col-span-2 flex flex-col gap-1 text-t2">꾸미기<select className={select} value={accessory} onChange={(e) => setAccessory(e.target.value)}><option value="">없음</option>{ACCESSORIES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
      </div>
    </main>
  );
}
