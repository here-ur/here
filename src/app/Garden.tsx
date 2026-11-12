"use client";

import { Button } from "./ui/Button";
import { useState, useSyncExternalStore } from "react";
import { COLLECTION_SIZE, type Garden as GardenState, type Plant, SEASON_LABEL, SEEDS, type SeasonId, TOPICS, WEATHER, buildGarden, dailySeeds, gardenAlbum, loadSeeds, pickSeed, seasonOf, speciesKey, speciesName, splineVariables } from "@/lib/garden";
import { type DayStat, type SkyId, SKIES, localDate } from "@/lib/report";
import Buddy from "./Buddy";
import type { Who } from "./Conversation";
import { SKY_LOOK, SkyIcon } from "./sky";
import Garden3D from "./Garden3D";
import SplineGarden, { GARDEN_SPLINE_URL } from "./SplineGarden";
import "./garden.css";

// 구름 정원 화면 맨 위의 정원. 이야기한 주제가 식물로 자라고, 어제 하늘이 오늘 정원 날씨가 된다.
// 기기의 리포트 숫자와 고른 씨앗만 쓰고, 서버나 AI에는 보내지 않는다.

const SKY_BG: Record<SkyId | "none", string> = {
  none: "#E8EFFF", sunny: "#FFF4D6", cozy: "#FFE9DE", cloudy: "#E9EDF4", rain: "#DCE7FB", thunder: "#E7E0FB", wind: "#DDF2EC",
};

// 하늘 배경 위에 반투명하게 떠 있는 카드
const card = "here-card p-5";

// 3D를 그릴 수 있는 기기인지 한 번만 확인한다. 안 되면 2D 그림을 쓴다.
let webglCache: boolean | null = null;
const canWebGL = () => {
  if (webglCache === null) {
    try { const c = document.createElement("canvas"); webglCache = Boolean(c.getContext("webgl2") ?? c.getContext("webgl")); } catch { webglCache = false; }
  }
  return webglCache;
};
const noSubscribe = () => () => {};

// 계절마다 섬 풀빛과 떨어지는 것이 바뀐다.
const SEASON_LOOK: Record<SeasonId, { top: string; top2: string; fall: string; shape: "petal" | "glint" | "leaf" | "snow" }> = {
  spring: { top: "#E5F5E3", top2: "#D3EED0", fall: "#F6B4E4", shape: "petal" },
  summer: { top: "#D6F0DA", top2: "#BFE6C6", fall: "#FFE38A", shape: "glint" },
  autumn: { top: "#F3EBD6", top2: "#EADDB9", fall: "#E8A23C", shape: "leaf" },
  winter: { top: "#F1F5FB", top2: "#E3EBF6", fall: "#FFFFFF", shape: "snow" },
};

function SeasonFall({ season }: { season: SeasonId }) {
  const look = SEASON_LOOK[season];
  return (
    <g aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => {
        const x = 18 + ((i * 53) % 270);
        const y = 20 + ((i * 37) % 110);
        const delay = `${(i % 5) * -1.3}s`;
        const shapeEl = look.shape === "petal" ? <ellipse rx={3} ry={1.8} fill={look.fall} />
          : look.shape === "leaf" ? <path d="M0-3c3 0 4 3 0 6-4-3-3-6 0-6Z" fill={look.fall} />
            : look.shape === "glint" ? <path d="M0-3v6M-3 0h6" stroke={look.fall} strokeWidth={1.4} strokeLinecap="round" />
              : <circle r={2} fill={look.fall} stroke="#DCE6F5" strokeWidth={0.6} />;
        return <g key={i} transform={`translate(${x} ${y})`}><g className={look.shape === "glint" ? "garden-twinkle" : "garden-fall"} style={{ animationDelay: delay }}>{shapeEl}</g></g>;
      })}
    </g>
  );
}

/** 섬 위 자리. 가운데 몽글이 자리는 비워 두고 황금각으로 고르게 흩뿌린다. */
function slots(count: number, rx: number) {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; out.length < count && i < count * 4; i++) {
    const r = Math.sqrt((i + 0.5) / (count * 1.6));
    const a = i * 2.39996;
    const x = 150 + Math.cos(a) * r * rx * 0.9;
    const y = 146 + Math.sin(a) * r * 17;
    if (Math.abs(x - 150) < 26 && y < 152) continue;
    out.push({ x, y });
  }
  return out.sort((a, b) => a.y - b.y);
}

function PlantShape({ plant, x, y, index }: { plant: Plant; x: number; y: number; index: number }) {
  const s = plant.stage === 3 ? 1 : plant.stage === 2 ? 0.8 : 0.58;
  const tint = plant.sky ? SKY_LOOK[plant.sky].tint : "#DDF2E4";
  const ink = plant.sky ? SKY_LOOK[plant.sky].ink : "#3E9A64";
  const green = "#6FBF8E";
  const body = (() => {
    switch (plant.topic) {
      case "work": return <><rect x={-1.6} y={-16} width={3.2} height={16} rx={1} fill="#A07B5A" /><circle cx={0} cy={-20} r={9} fill={green} /><circle cx={5} cy={-16} r={5.5} fill={tint} stroke={ink} strokeOpacity={0.35} /></>;
      case "people": return <><path d="M0 0v-14" stroke={green} strokeWidth={1.8} strokeLinecap="round" /><path d="M0-8q4-3 6 0" stroke={green} strokeWidth={1.4} fill="none" /><g fill={tint} stroke={ink} strokeOpacity={0.5}>{[0, 72, 144, 216, 288].map((d) => <circle key={d} cx={Math.cos((d * Math.PI) / 180) * 3.6} cy={-17 + Math.sin((d * Math.PI) / 180) * 3.6} r={2.8} />)}</g><circle cx={0} cy={-17} r={2} fill={ink} /></>;
      case "rest": return <><ellipse cx={-4} cy={-2.5} rx={6} ry={3.4} fill={green} /><ellipse cx={4} cy={-3} rx={5} ry={3.8} fill={tint} stroke={ink} strokeOpacity={0.35} /></>;
      case "likes": return <><ellipse cx={0} cy={-6} rx={8} ry={6.5} fill={green} /><circle cx={-3} cy={-7} r={2.2} fill={ink} /><circle cx={3} cy={-4} r={2.2} fill={ink} /><circle cx={2.5} cy={-9.5} r={1.8} fill={ink} fillOpacity={0.7} /></>;
      default: return <><rect x={-1.8} y={-8} width={3.6} height={8} rx={1.4} fill="#F4EDE4" /><path d="M-7-8a7 6 0 0 1 14 0Z" fill={tint} stroke={ink} strokeOpacity={0.5} /><circle cx={-2.5} cy={-10} r={1} fill="#fff" /></>;
    }
  })();
  return (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s})`}>
      <g className="garden-plant" style={{ animationDelay: `${(index % 7) * -0.6}s` }}>{body}</g>
    </g>
  );
}

function Weather({ sky }: { sky: SkyId | null }) {
  if (sky === "sunny" || sky === "cozy") return <g><g className="garden-sun"><circle cx={252} cy={34} r={13} fill="#FFD66B" />{Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${252 + Math.cos(i * 0.785) * 18} ${34 + Math.sin(i * 0.785) * 18}l${Math.cos(i * 0.785) * 5} ${Math.sin(i * 0.785) * 5}`} stroke="#FFD66B" strokeWidth={2} strokeLinecap="round" />)}</g>{sky === "cozy" && <ellipse className="garden-cloud" cx={228} cy={46} rx={18} ry={7} fill="#fff" />}</g>;
  if (sky === "rain" || sky === "thunder") return <g><ellipse className="garden-cloud" cx={80} cy={30} rx={26} ry={9} fill="#fff" /><ellipse className="garden-cloud" cx={215} cy={24} rx={22} ry={8} fill="#fff" />{sky === "thunder" && <path d="M222 30l-6 10h6l-5 10" stroke="#8B74F0" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />}{Array.from({ length: 12 }, (_, i) => <path key={i} className="garden-rain" style={{ animationDelay: `${(i % 6) * -0.18}s` }} d={`M${30 + i * 22} ${54 + (i % 3) * 8}l-2 6`} stroke="#7FA2E8" strokeWidth={1.6} strokeLinecap="round" />)}</g>;
  if (sky === "wind") return <g>{[40, 62, 84].map((y, i) => <path key={y} className="garden-wind" style={{ animationDelay: `${i * -1.1}s` }} d={`M${40 + i * 30} ${y}h70a8 8 0 1 0-8-8`} stroke="#86CDB8" strokeWidth={1.8} fill="none" strokeLinecap="round" />)}</g>;
  return <g><ellipse className="garden-cloud" cx={70} cy={32} rx={24} ry={8} fill="#fff" fillOpacity={0.9} /><ellipse className="garden-cloud" cx={230} cy={26} rx={20} ry={7} fill="#fff" fillOpacity={0.9} /></g>;
}

function Scene({ who, garden, season, small = false }: { who: Who; garden: GardenState; season: SeasonId; small?: boolean }) {
  const rx = 72 + garden.level.level * 12;
  const look = SEASON_LOOK[season];
  const shown = garden.plants.slice(-36);
  const spots = slots(shown.length, rx);
  const sky = garden.weather;
  return (
    <div className="relative overflow-hidden rounded-r5" style={{ background: SKY_BG[sky ?? "none"] }}>
      <svg viewBox="0 0 300 200" className="block w-full" role="img" aria-label={`구름 정원: ${garden.level.name}, 식물 ${garden.plants.length}개${sky ? `, 오늘 날씨 ${SKIES.find((s) => s.id === sky)?.label}` : ""}`}>
        {!small && <Weather sky={sky} />}
        {!small && <SeasonFall season={season} />}
        <ellipse cx={150} cy={170} rx={rx + 14} ry={24} fill="#fff" />
        <ellipse cx={150} cy={150} rx={rx} ry={22} fill={look.top} />
        <ellipse cx={150} cy={145} rx={rx - 10} ry={14} fill={look.top2} fillOpacity={0.8} />
        {shown.map((plant, i) => spots[i] && <PlantShape key={`${plant.date}-${plant.topic}`} plant={plant} x={spots[i].x} y={spots[i].y} index={i} />)}
      </svg>
      <div aria-hidden="true" className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2">
        <Buddy shape={who.shape} color={who.color} accessory={who.accessory} size={small ? 30 : 76} look={[0, 0.15]} bob={!small} />
      </div>
    </div>
  );
}

// onDecorate는 보상 안내를 캐릭터 화면으로 옮겨서 지금은 쓰지 않는다(호출부 호환용).
export default function Garden({ who, days, now, onSeed, splineUrl = GARDEN_SPLINE_URL }: { who: Who; days: DayStat[]; now: number; onSeed?: (opener: string) => void; onDecorate?: () => void; splineUrl?: string }) {
  const [seeds, setSeeds] = useState(() => loadSeeds());
  const garden = buildGarden(days, seeds, now);
  const today = localDate(now);
  const todaySeed = SEEDS.find((s) => s.id === seeds[today]);
  const offered = dailySeeds(today);
  const sky = garden.weather;
  const season = seasonOf(now).id;
  const album = gardenAlbum(days, seeds, now);
  const webgl = useSyncExternalStore(noSubscribe, canWebGL, () => false);
  const flat = <Scene who={who} garden={garden} season={season} />;

  return (
    <>
      <section aria-labelledby="garden-title">
        <div className="relative -mx-2">
          {/* 디자이너의 Spline 장면이 있으면 그걸, 없으면 three.js 3D 섬을, 3D가 안 되는 기기면 2D 그림을 쓴다. */}
          {splineUrl
            ? <SplineGarden url={splineUrl} variables={splineVariables(garden, season, who.accessory)} label={`구름 정원 3D: ${garden.level.name}, 식물 ${garden.plants.length}개`} fallback={flat} />
            : webgl ? <Garden3D garden={garden} season={season} weather={garden.weather} color={who.color} shape={who.shape} accessory={who.accessory} transparent /> : flat}
        </div>
        <div className={`${card} relative -mt-4 !p-4`}>
        <div className="flex items-end justify-between px-1">
          <div>
            <p className="text-t2 font-medium text-ios-secondary">{SEASON_LABEL[season]}의 구름 정원</p>
            <h3 id="garden-title" className="text-t9 font-bold text-[#1F2A55]">{garden.level.name}</h3>
          </div>
          <span className="rounded-full bg-[#1F2A55] px-3 py-1.5 text-t3 font-bold text-white">Lv.{garden.level.level}</span>
        </div>
        <div className="px-2">
        <p className="mt-3 flex items-center gap-1.5 text-t3 text-[#3D4559]">
          {sky && <SkyIcon id={sky} size={18} />}
          {sky ? WEATHER[sky].gift : garden.plants.length ? "오늘 이야기하면 새싹이 하나 더 돋아요" : "이야기하면 정원에 첫 새싹이 돋아요"}
        </p>
        {/* 글은 줄이고 막대 하나로: 다음 섬까지 남은 식물 수만 적는다. 보상 안내는 캐릭터 화면에 있다. */}
        <div className="mt-3">
          <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-[#E9ECF3]">
            <span className="block h-full rounded-full bg-[#7BC59A] transition-[width] duration-[var(--seed-duration-d6)]" style={{ width: `${Math.round(garden.progress * 100)}%` }} />
          </span>
          <p className="mt-1.5 text-right text-t1 tabular-nums text-[#8A91A3]">{garden.next ? `${garden.next.name}까지 식물 ${garden.toNext}개` : "가장 큰 섬이에요"}</p>
        </div>
        </div>
        </div>
      </section>


      <section className={`${card} mt-4`} aria-labelledby="garden-seeds">
        <div className="flex items-baseline justify-between">
          <h3 id="garden-seeds" className="text-t5 font-bold text-[#1F2A55]">오늘의 이야기 씨앗</h3>
          <span className="text-t2 text-ios-secondary">{todaySeed ? "심었어요" : "하나 골라요"}</span>
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {offered.map((seed) => {
            const topic = TOPICS.find((t) => t.id === seed.topic)!;
            const picked = todaySeed?.id === seed.id;
            return (
              <li key={seed.id}>
                <Button variant="plain"
                  onClick={() => { pickSeed(seed.id, now); setSeeds(loadSeeds()); onSeed?.(seed.opener); }}
                  aria-pressed={picked}
                  data-sfx={picked ? "tap" : "success"}
                  className={`ui-press flex h-full min-h-20 w-full flex-col justify-between rounded-r4 p-3 text-left ${picked ? "bg-[#1F2A55] text-white" : "bg-[#F4F6FB] text-[#1F2A55] hover:bg-[#EEF1F8]"}`}
                >
                  <span className="text-t3 font-bold leading-snug">{seed.label}</span>
                  <span className={`mt-2 text-t1 ${picked ? "text-white/70" : "text-[#8A91A3]"}`}>{picked ? "심은 씨앗" : `${topic.plant} 씨앗`}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={`${card} mt-4`} aria-labelledby="garden-book">
        <div className="flex items-baseline justify-between">
          <h3 id="garden-book" className="text-t5 font-bold text-[#1F2A55]">정원 도감</h3>
          <span className="text-t2 tabular-nums text-ios-secondary">{garden.collected.size} / {COLLECTION_SIZE}</span>
        </div>
        <table className="mt-3 w-full table-fixed border-separate border-spacing-1 text-center">
          <caption className="sr-only">주제와 그날 하늘로 모으는 식물 도감</caption>
          <thead>
            <tr>
              <th scope="col" className="w-12" />
              {SKIES.map((s) => <th key={s.id} scope="col" aria-label={s.label} className="pb-1.5"><span className="inline-grid place-items-center"><SkyIcon id={s.id} size={22} /></span></th>)}
            </tr>
          </thead>
          <tbody>
            {TOPICS.map((topic) => (
              <tr key={topic.id}>
                <th scope="row" className="text-left text-t2 font-medium text-[#3D4559]">{topic.plant}</th>
                {SKIES.map((s) => {
                  const got = garden.collected.has(speciesKey(topic.id, s.id));
                  return (
                    <td key={s.id} aria-label={got ? speciesName(topic.id, s.id) : "아직 못 찾았어요"}>
                      <span className={`mx-auto grid aspect-square w-full max-w-8 place-items-center rounded-r2 ${got ? "" : "border border-dashed border-[#D5DAE5]"}`} style={got ? { background: SKY_LOOK[s.id].tint } : undefined}>
                        {got ? <span aria-hidden="true" className="size-2 rounded-full" style={{ background: SKY_LOOK[s.id].ink }} /> : <span aria-hidden="true" className="text-t1 text-[#C5CAD6]">?</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`${card} mt-4`} aria-labelledby="garden-album">
        <h3 id="garden-album" className="text-t5 font-bold text-[#1F2A55]">정원 앨범</h3>
        {album.length ? (
          <ul className="-mx-1 mt-3 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {album.map((page) => (
              <li key={page.key} className="w-40 shrink-0 snap-start">
                <Scene who={who} garden={page.garden} season={page.season} small />
                <p className="mt-1.5 text-t3 font-bold text-[#1F2A55]">{page.label}</p>
                <p className="text-t1 text-ios-secondary">{page.garden.level.name} · 식물 {page.garden.plants.length}개</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-t2 text-[#8A91A3]">계절이 바뀌면 지금 정원이 여기 남아요.</p>
        )}
      </section>
    </>
  );
}
