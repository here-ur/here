import { useId } from "react";
import { COLORS, type ColorId } from "@/lib/onboarding";

// 새 몽글이: 광택 구름 + 왕눈 + 검정 낙서(머리·입). 표정은 눈동자 방향·입 모양·눈꺼풀로 만든다.
// 구름 모양은 240×240 좌표 기준이고, 크기는 size로만 바꾼다.

const CLOUD =
  "M62 184 C36 184 28 160 40 146 C30 126 46 106 68 112 C72 84 98 70 122 77 " +
  "C138 60 172 64 178 92 C198 90 214 108 205 128 C218 142 212 184 184 184 Z";
const HAIR = "M128 74 C129 58 141 54 144 66 C146 54 159 52 161 66";
const INK = "#16131F";

const MOUTH = {
  smile: "M-7 0 C-3 6 4 6 8 -1",
  tongue: "M-8 -1 C-6 9 6 9 8 -1 M-1 4 C-1 12 6 12 6 4",
  o: "M0 -1 m-4.5 0 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0",
  calm: "M-5 0 C-2 3 2 3 5 0",
};

export type Look = readonly [number, number]; // 눈동자 방향, -1..1
export type Mouth = keyof typeof MOUTH;

function Eye({ cx, cy, look, lid, id, white }: { cx: number; cy: number; look: Look; lid?: boolean; id: string; white: string }) {
  const r = 19;
  const px = cx + look[0] * r * 0.36;
  const py = cy + look[1] * r * 0.36;
  const move = { transition: "cx .35s ease, cy .35s ease" };
  return (
    <g className="motion-safe:animate-blink" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
      {lid && (
        <clipPath id={`${id}-lid`}>
          <rect x={cx - r - 2} y={cy - r * 0.12} width={2 * r + 4} height={2 * r + 8} />
        </clipPath>
      )}
      <g clipPath={lid ? `url(#${id}-lid)` : undefined}>
        <circle cx={cx} cy={cy + r * 0.1} r={r} fill="#D3DEEC" />
        <circle cx={cx} cy={cy} r={r} fill={white} />
        <circle cx={px} cy={py} r={r * 0.5} fill={INK} style={move} />
        {/* 반짝임: 이게 없으면 눈동자가 빈 구멍처럼 보여서 징그럽다 */}
        <circle cx={px - r * 0.17} cy={py - r * 0.2} r={r * 0.15} fill="#FFFFFF" style={move} />
      </g>
      {lid && <path d={`M${cx - r + 1} ${cy - r * 0.12} H${cx + r - 1}`} stroke={INK} strokeWidth="3.6" strokeLinecap="round" />}
    </g>
  );
}

export default function Buddy({
  color = "lavender",
  size,
  look = [0.4, 0.3],
  mouth = "smile",
  lid = false,
  bob = false,
  className = "",
}: {
  color?: ColorId;
  size: number;
  look?: Look;
  mouth?: Mouth;
  lid?: boolean;
  bob?: boolean;
  className?: string;
}) {
  const id = `buddy${useId().replace(/[^a-zA-Z0-9]/g, "")}`; // useId의 특수문자는 url(#…)에서 깨질 수 있다
  const c = COLORS.find((x) => x.id === color) ?? COLORS[0];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      overflow="visible"
      aria-hidden="true"
      className={`${bob ? "motion-safe:animate-float" : "motion-safe:animate-breathe"} ${className}`}
    >
      <defs>
        <clipPath id={`${id}-body`}>
          <path d={CLOUD} />
        </clipPath>
        <filter id={`${id}-soft`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="20" />
        </filter>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".55" stopColor={c.light} />
          <stop offset="1" stopColor={c.base} />
        </linearGradient>
        <linearGradient id={`${id}-eye`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E4EEF8" />
        </linearGradient>
      </defs>

      {/* 뒤쪽 빛: 어두운 배경에서도 낙서 머리가 보이게 */}
      <path d={CLOUD} fill={c.light} opacity=".55" filter={`url(#${id}-glow)`} transform="translate(120 128) scale(1.12) translate(-120 -128)" />
      <path d={CLOUD} fill={c.base} opacity=".5" filter={`url(#${id}-glow)`} transform="translate(0 8)" />

      <g clipPath={`url(#${id}-body)`}>
        <path d={CLOUD} fill={`url(#${id}-fill)`} />
        <g filter={`url(#${id}-soft)`}>
          <ellipse cx="70" cy="178" rx="62" ry="34" fill={c.blob1} opacity=".55" />
          <ellipse cx="198" cy="152" rx="42" ry="40" fill={c.blob2} opacity=".5" />
          <ellipse cx="126" cy="94" rx="56" ry="26" fill="#FFFFFF" opacity=".95" />
        </g>
      </g>
      <path d={CLOUD} fill="none" stroke="#FFFFFF" strokeOpacity=".8" strokeWidth="2" />

      <path d={HAIR} fill="none" stroke={INK} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <Eye cx={102} cy={138} look={look} id={`${id}-l`} white={`url(#${id}-eye)`} />
      <Eye cx={138} cy={136} look={look} lid={lid} id={`${id}-r`} white={`url(#${id}-eye)`} />
      <path d={MOUTH[mouth]} transform="translate(124 168)" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
