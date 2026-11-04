"use client";
import { SKIES, type SkyId } from "@/lib/report";
import { SKY_LOOK, SkyIcon, SkyLineIcon } from "../../sky";

// 하늘 아이콘 스타일 비교 시안. A는 Microsoft Fluent Emoji 3D(MIT)를 GitHub에서 바로 불러와 보기만 한다(저장소에 넣지 않음).
const FLUENT: Record<SkyId, string> = {
  sunny: "Sun/3D/sun_3d.png",
  cozy: "Sun behind cloud/3D/sun_behind_cloud_3d.png",
  cloudy: "Cloud/3D/cloud_3d.png",
  rain: "Cloud with rain/3D/cloud_with_rain_3d.png",
  thunder: "Cloud with lightning/3D/cloud_with_lightning_3d.png",
  wind: "Dashing away/3D/dashing_away_3d.png",
};
const fluentUrl = (id: SkyId) => `https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/${encodeURI(FLUENT[id])}`;

const card = "rounded-r6 bg-white/80 p-5 shadow-[0_8px_28px_rgba(28,38,80,.07)]";

function Row({ title, note, render }: { title: string; note: string; render: (id: SkyId, size: number) => React.ReactNode }) {
  return (
    <section className={card}>
      <h2 className="text-t5 font-bold text-[#1F2A55]">{title}</h2>
      <p className="mt-1 text-t2 text-[#5A6478]">{note}</p>
      <div className="mt-4 grid grid-cols-6 gap-2">
        {SKIES.map((s) => <div key={s.id} className="flex flex-col items-center gap-1.5"><span className="grid size-10 place-items-center">{render(s.id, 34)}</span><span className="text-t1 text-[#5A6478]">{s.label}</span></div>)}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-t1 text-[#8A91A3]">작게·색 원 안</span>
        {SKIES.map((s) => <span key={s.id} className="grid size-7 place-items-center rounded-full" style={{ background: SKY_LOOK[s.id].tint }}>{render(s.id, 18)}</span>)}
      </div>
    </section>
  );
}

export default function Preview() {
  return (
    <main className="app-frame overflow-y-auto bg-[#F4F2FF] px-gutter py-8 text-[#111318]">
      <h1 className="text-t7 font-bold text-[#1F2A55]">하늘 아이콘 시안</h1>
      <p className="mt-1 text-t2 text-[#5A6478]">정원 도감·라이브러리·하루 화면에 함께 쓸 하늘 6개.</p>
      <div className="mt-5 flex flex-col gap-4">
        <Row title="A. Fluent 3D 이모지" note="Microsoft 공개(MIT) 3D 렌더. 고르면 PNG 6장을 받아 넣어요(바람은 '휙' 이모지)." render={(id, size) => <img src={fluentUrl(id)} width={size} height={size} alt="" />} /> {/* eslint-disable-line @next/next/no-img-element -- 시안 비교용 외부 그림 */}
        <Row title="B. 면 아이콘 (지금)" note="한 색으로 채운 납작한 모양. 입체 없음. 이걸로 정했어요." render={(id, size) => <SkyIcon id={id} size={size} />} />
        <Row title="C. 선 아이콘 (예전)" note="가는 선. 전에 쓰던 것." render={(id, size) => <SkyLineIcon id={id} size={size} />} />
      </div>
    </main>
  );
}
