"use client";

import { useEffect, useState } from "react";
import { type ColorId, accentButton } from "@/lib/onboarding";
import { Icon } from "./art";
import Sheet from "./Sheet";

export type Hospital = {
  name: string;
  kind: string;
  addr: string;
  tel: string;
  lat: number;
  lng: number;
  distance: number; // m
};

type State = { status: "loading" } | { status: "error"; message: string } | { status: "done"; list: Hospital[] };

// 병원 알선 금지(의료법 27조 3항): 모든 병원을 같은 모양으로, 서버가 준 거리순 그대로 보여 준다.
// 첫 줄을 강조하거나 배지·평점을 붙이지 않는다.
export default function Hospitals({ color = "lavender", onClose }: { color?: ColorId; onClose: () => void }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(`/api/hospitals?lat=${coords.latitude}&lng=${coords.longitude}`);
          const data = await res.json();
          setState(res.ok ? { status: "done", list: data.list } : { status: "error", message: data.error });
        } catch {
          setState({ status: "error", message: "병원 정보를 불러올 수 없어요." });
        }
      },
      () => setState({ status: "error", message: "위치를 알 수 없어요. 위치 권한을 켜면 가까운 곳을 찾아 줄게." }),
      { timeout: 10000 },
    );
  }, []);

  const notice = (
    <p className="text-xs leading-relaxed text-[#5A6478]">Here!는 특정 병원을 추천하거나 연결 대가를 받지 않아요. 출처: 건강보험심사평가원 병원정보서비스</p>
  );

  return (
    <Sheet title="가까운 정신건강의학과" onClose={onClose}>
      <p className="text-sm text-[#3D4559]">내 위치에서 5km 안, 가까운 순서예요.</p>

      {state.status === "loading" && <p className="py-12 text-center text-[15px] text-[#5A6478]">가까운 곳을 찾는 중…</p>}
      {state.status === "error" && <p className="py-12 text-center text-[15px] text-[#5A6478]">{state.message}</p>}
      {state.status === "done" && state.list.length === 0 && <p className="py-12 text-center text-[15px] text-[#5A6478]">근처 5km 안에서 찾지 못했어요.</p>}

      {state.status === "done" && (
        <ul className="mt-4 flex flex-col gap-2.5">
          {state.list.map((h) => (
            <li key={`${h.name}-${h.addr}`} className="rounded-[22px] bg-[#F5F7FB] p-4">
              <div className="flex items-start justify-between gap-3">
                <b className="text-base font-semibold text-[#111318]">{h.name}</b>
                <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#3D4559]">{(h.distance / 1000).toFixed(1)}km</span>
              </div>
              <p className="mt-1 text-[13.5px] text-[#5A6478]">
                {h.kind && `${h.kind} · `}
                {h.addr}
              </p>
              <div className="mt-3 flex gap-2">
                {h.tel && (
                  <a
                    href={`tel:${h.tel}`}
                    aria-label={`${h.name}에 전화하기`}
                    style={accentButton(color)}
                    className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-bold text-white"
                  >
                    <Icon name="phone" size={18} />
                    전화
                  </a>
                )}
                <a
                  href={`https://map.kakao.com/link/map/${encodeURIComponent(h.name)},${h.lat},${h.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${h.name} 지도 보기`}
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-white text-sm font-bold text-[#1F2A55] shadow-[0_2px_8px_rgba(28,38,80,.06)]"
                >
                  <Icon name="pin" size={18} />
                  지도
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">{notice}</div>
    </Sheet>
  );
}
