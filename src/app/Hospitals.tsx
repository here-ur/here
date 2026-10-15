"use client";

import { useEffect, useState } from "react";
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

export default function Hospitals({ onClose }: { onClose: () => void }) {
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

  return (
    <Sheet title="가까운 정신건강의학과" onClose={onClose}>
      <p className="text-sm text-ink-3">내 위치에서 5km 안, 가까운 순서예요.</p>

      {state.status === "loading" && <p className="py-10 text-center text-ink-3">찾는 중…</p>}
      {state.status === "error" && <p className="py-10 text-center text-ink-3">{state.message}</p>}
      {state.status === "done" && state.list.length === 0 && (
        <p className="py-10 text-center text-ink-3">근처 5km 안에서 찾지 못했어요.</p>
      )}

      {state.status === "done" && (
        <ul className="mt-4 flex flex-col gap-2.5">
          {state.list.map((h) => (
            <li key={`${h.name}-${h.addr}`} className="rounded-[18px] bg-violet-tint p-4">
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-base">{h.name}</b>
                <span className="shrink-0 text-sm font-semibold text-violet">{(h.distance / 1000).toFixed(1)}km</span>
              </div>
              <p className="mt-0.5 text-sm text-ink-2">
                {h.kind && `${h.kind} · `}
                {h.addr}
              </p>
              <div className="mt-3 flex gap-2">
                {h.tel && (
                  <a href={`tel:${h.tel}`} className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-violet font-bold text-white">
                    <Icon name="phone" size={18} />
                    전화
                  </a>
                )}
                <a
                  href={`https://map.kakao.com/link/map/${encodeURIComponent(h.name)},${h.lat},${h.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-white font-bold text-ink"
                >
                  <Icon name="pin" size={18} />
                  지도
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-xs leading-relaxed text-ink-3">
        Here!는 특정 병원을 추천하거나 연결 대가를 받지 않아요. 출처: 건강보험심사평가원 병원정보서비스
      </p>
    </Sheet>
  );
}
