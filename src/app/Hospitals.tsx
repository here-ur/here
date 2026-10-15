"use client";

import { useEffect, useState } from "react";

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
        const res = await fetch(`/api/hospitals?lat=${coords.latitude}&lng=${coords.longitude}`);
        const data = await res.json();
        setState(res.ok ? { status: "done", list: data.list } : { status: "error", message: data.error });
      },
      () => setState({ status: "error", message: "위치를 알 수 없어요. 위치 권한을 켜면 가까운 곳을 찾아 줄게." }),
      { timeout: 10000 },
    );
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="가까운 정신건강의학과" className="fixed inset-0 z-10 flex items-end bg-ink/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-cream p-5 pb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">가까운 정신건강의학과</h2>
          <button onClick={onClose} className="rounded-full bg-white px-4 py-2 text-sm">닫기</button>
        </div>

        {state.status === "loading" && <p className="py-8 text-center text-ink-3">찾는 중…</p>}
        {state.status === "error" && <p className="py-8 text-center text-ink-3">{state.message}</p>}
        {state.status === "done" && state.list.length === 0 && (
          <p className="py-8 text-center text-ink-3">근처 5km 안에서 찾지 못했어요.</p>
        )}

        {state.status === "done" && (
          <ul className="flex flex-col gap-3">
            {state.list.map((h) => (
              <li key={`${h.name}-${h.addr}`} className="rounded-2xl bg-white p-4">
                <p className="font-bold">{h.name}</p>
                <p className="text-sm text-ink-3">
                  {h.kind} · {(h.distance / 1000).toFixed(1)}km
                </p>
                <p className="mt-1 text-sm text-ink-2">{h.addr}</p>
                <div className="mt-3 flex gap-2">
                  {h.tel && (
                    <a href={`tel:${h.tel}`} className="flex-1 rounded-full bg-violet py-2 text-center font-bold text-white">
                      전화
                    </a>
                  )}
                  <a
                    href={`https://map.kakao.com/link/map/${encodeURIComponent(h.name)},${h.lat},${h.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-full bg-violet-tint py-2 text-center font-bold text-violet"
                  >
                    지도
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-5 text-xs leading-relaxed text-ink-3">
          가까운 순서로만 보여 줘요. Here!는 특정 병원을 추천하거나 연결 대가를 받지 않아요.
          <br />
          출처: 건강보험심사평가원 병원정보서비스
        </p>
      </div>
    </div>
  );
}
