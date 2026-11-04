"use client";

import type { SkyId } from "@/lib/report";

// 하늘은 색뿐 아니라 모양으로도 구분한다. 시안(R1~R6)과 같은 그림이다.
export const SKY_LOOK: Record<SkyId, { tint: string; ink: string; paths: React.ReactNode }> = {
  sunny: { tint: "#FFF1C2", ink: "#B07A00", paths: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.8v2.2M12 19v2.2M2.8 12h2.2M19 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M5.5 18.5l1.6-1.6M16.9 7.1l1.6-1.6" /></> },
  cozy: { tint: "#FFE3D3", ink: "#C4572E", paths: <><circle cx="9" cy="9" r="3.4" /><path d="M9 2.6v1.6M2.6 9h1.6M4.5 4.5l1.1 1.1M13.5 4.5l-1.1 1.1" /><path d="M8 19.5h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8.2 13 3.3 3.3 0 0 0 8 19.5Z" /></> },
  cloudy: { tint: "#E6EAF2", ink: "#5B677E", paths: <path d="M7 18.5h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 7 18.5Z" /> },
  rain: { tint: "#DCE8FF", ink: "#2F62C9", paths: <><path d="M7 14.5h10a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7 14.5Z" /><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" /></> },
  thunder: { tint: "#EAE2FF", ink: "#5E49D8", paths: <><path d="M7 14.5h10a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7 14.5Z" /><path d="M12.5 15.5l-2 3.5h3l-2 3.5" /></> },
  wind: { tint: "#DDF4EE", ink: "#0F7A66", paths: <path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 17h7" /> },
};


/** 예전 선 아이콘. 지금은 비교 시안(/dev/sky-icons)에서만 쓴다. */
export function SkyLineIcon({ id, size = 18 }: { id: SkyId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={SKY_LOOK[id].ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SKY_LOOK[id].paths}
    </svg>
  );
}

// 하늘 아이콘: 입체 없이 한 색으로 채운 납작한 면 모양(시안 B로 결정). 선 아이콘과 같은 모양을 면으로 바꾼 것이다.
const FLAT: Record<SkyId, React.ReactNode> = {
  sunny: <><circle cx="12" cy="12" r="5" fill="#FFC53D" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="#FFC53D" strokeWidth="2.4" strokeLinecap="round" /></>,
  cozy: <><circle cx="9" cy="9" r="4.5" fill="#FFB454" /><path d="M8 20h9a3.8 3.8 0 0 0 .4-7.6A5.2 5.2 0 0 0 7.4 13.4 3.4 3.4 0 0 0 8 20Z" fill="#DCE3EF" /></>,
  cloudy: <path d="M7 19h10.5a4.2 4.2 0 0 0 .5-8.4A5.8 5.8 0 0 0 6.8 12 3.6 3.6 0 0 0 7 19Z" fill="#B9C4D8" />,
  rain: <><path d="M7 15h10.5a3.8 3.8 0 0 0 .4-7.6A5.2 5.2 0 0 0 7.4 8.4 3.2 3.2 0 0 0 7 15Z" fill="#9FB0CC" /><path d="M8.5 17.5l-1.2 3M12.5 17.5l-1.2 3M16.5 17.5l-1.2 3" stroke="#3B74E0" strokeWidth="2.2" strokeLinecap="round" /></>,
  thunder: <><path d="M7 14h10.5a3.8 3.8 0 0 0 .4-7.6A5.2 5.2 0 0 0 7.4 7.4 3.2 3.2 0 0 0 7 14Z" fill="#9FB0CC" /><path d="M13.5 13l-3.5 5h2.5l-1.5 4.5 4-6h-2.5l1-3.5Z" fill="#FFC53D" /></>,
  wind: <path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 17h7" stroke="#2FA58C" strokeWidth="2.8" strokeLinecap="round" fill="none" />,
};

export function SkyIcon({ id, size = 18 }: { id: SkyId; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{FLAT[id]}</svg>;
}

export function SkyDot({ id, size = 28 }: { id: SkyId; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: SKY_LOOK[id].tint }}>
      <SkyIcon id={id} size={Math.round(size * 0.64)} />
    </span>
  );
}

