import { useId } from "react";
import { COLORS, type ColorId, type ShapeId } from "@/lib/onboarding";
import "./buddy-motion.css";

// 몽글이 두 가지 모습. 둘 다 검정 낙서(머리·입)가 들어간다. 표정은 눈동자 방향·입 모양·눈꺼풀로 만든다.
// - cloud(구름): 광택 구름 + 왕눈
// - round(동글): 여러 색이 번진 동그라미 + 낙서 점 눈
// 모양은 240×240 좌표 기준이고, 크기는 size로만 바꾼다.

const INK = "#16131F";
const CLOUD =
  "M62 184 C36 184 28 160 40 146 C30 126 46 106 68 112 C72 84 98 70 122 77 " +
  "C138 60 172 64 178 92 C198 90 214 108 205 128 C218 142 212 184 184 184 Z";
const CLOUD_HAIR = "M128 74 C129 58 141 54 144 66 C146 54 159 52 161 66";
const ROUND_HAIR = "M86 64 C88 50 98 46 102 58 C104 46 116 44 118 58";

const CLOUD_MOUTH = {
  smile: "M-7 0 C-3 6 4 6 8 -1",
  tongue: "M-8 -1 C-6 9 6 9 8 -1 M-1 4 C-1 12 6 12 6 4",
  o: "M0 -1 m-4.5 0 a4.5 4.5 0 1 0 9 0 a4.5 4.5 0 1 0 -9 0",
  calm: "M-5 0 C-2 3 2 3 5 0",
};
// 동글이 얼굴은 레퍼런스처럼 작게: 점 눈 아래 12px쯤
const ROUND_MOUTH = {
  smile: "M-6 13 C-2 19 5 19 8 12",
  tongue: "M-7 10 C-5 20 6 20 8 10 M-1 15 C-1 22 6 22 6 15",
  o: "M1 15 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0",
  calm: "M-4 13 C-1 16 3 16 5 13",
};

export type Look = readonly [number, number]; // 눈동자 방향, -1..1
export type Mouth = keyof typeof CLOUD_MOUTH;
// 입력·연결 상태만 표현한다. 사용자가 쓴 내용으로 감정을 추측하지 않는다.
export type BuddyState = "idle" | "attentive" | "listening" | "thinking" | "speaking";
type Palette = (typeof COLORS)[number];
type Face = { look: Look; mouth: Mouth; lid: boolean };

const STATE_FACE = {
  idle: { look: [0.4, 0.3], mouth: "smile", lid: false },
  attentive: { look: [0, 0.65], mouth: "calm", lid: false },
  listening: { look: [0, 0.1], mouth: "calm", lid: false },
  thinking: { look: [0.45, -0.4], mouth: "calm", lid: false },
  speaking: { look: [0.15, 0.2], mouth: "o", lid: false },
} as const satisfies Record<BuddyState, Face>;

function GooglyEye({ cx, cy, look, lid, id }: { cx: number; cy: number; look: Look; lid?: boolean; id: string }) {
  const r = 19;
  return (
    <g className="buddy-eye-blink">
      {lid && (
        <clipPath id={`${id}-lid`}>
          <rect x={cx - r - 2} y={cy - r * 0.12} width={2 * r + 4} height={2 * r + 8} />
        </clipPath>
      )}
      <g clipPath={lid ? `url(#${id}-lid)` : undefined}>
        <circle cx={cx} cy={cy + r * 0.1} r={r} fill="#D3DEEC" />
        <circle cx={cx} cy={cy} r={r} fill="#FFFFFF" />
        <g className="buddy-look-position" style={{ transform: `translate(${look[0] * r * 0.36}px, ${look[1] * r * 0.36}px)` }}>
          <g className="buddy-gaze">
            <circle cx={cx} cy={cy} r={r * 0.5} fill={INK} />
            {/* 반짝임: 이게 없으면 눈동자가 빈 구멍처럼 보여서 징그럽다 */}
            <circle cx={cx - r * 0.17} cy={cy - r * 0.2} r={r * 0.15} fill="#FFFFFF" />
          </g>
        </g>
      </g>
      {lid && <path d={`M${cx - r + 1} ${cy - r * 0.12} H${cx + r - 1}`} stroke={INK} strokeWidth="3.6" strokeLinecap="round" />}
    </g>
  );
}

function CloudBody({ c, face, id }: { c: Palette; face: Face; id: string }) {
  return (
    <>
      <defs>
        <clipPath id={`${id}-body`}>
          <path d={CLOUD} />
        </clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".55" stopColor={c.light} />
          <stop offset="1" stopColor={c.base} />
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
      <path d={CLOUD_HAIR} fill="none" stroke={INK} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <GooglyEye cx={102} cy={138} look={face.look} id={`${id}-l`} />
      <GooglyEye cx={138} cy={136} look={face.look} lid={face.lid} id={`${id}-r`} />
      <g transform="translate(124 168)">
        <g className="buddy-mouth-motion">
          <path d={CLOUD_MOUTH[face.mouth]} fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    </>
  );
}

function RoundBody({ c, face, id }: { c: Palette; face: Face; id: string }) {
  const [lx, ly] = face.look;
  const sc = 1.25;
  const ex = lx * 3; // 점 눈도 보는 쪽으로 조금 움직인다
  const ey = ly * 3;
  const stroke = { fill: "none", stroke: INK, strokeWidth: 4 / sc, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <>
      <defs>
        <clipPath id={`${id}-body`}>
          <circle cx="120" cy="128" r="82" />
        </clipPath>
        <radialGradient id={`${id}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset=".6" stopColor={c.light} stopOpacity=".85" />
          <stop offset=".72" stopColor={c.base} stopOpacity=".55" />
          <stop offset="1" stopColor={c.base} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* 가장자리 빛: 원 밖으로 나온 낙서 머리가 어두운 배경에서도 보이게 */}
      <circle cx="120" cy="128" r="116" fill={`url(#${id}-halo)`} />
      <g clipPath={`url(#${id}-body)`}>
        <circle cx="120" cy="128" r="82" fill={c.base} />
        <g filter={`url(#${id}-soft)`}>
          <ellipse cx="75" cy="153" rx="57" ry="51" fill={c.blob1} />
          <ellipse cx="165" cy="91" rx="51" ry="45" fill={c.blob2} />
          <ellipse cx="136" cy="206" rx="62" ry="31" fill={c.light} />
        </g>
      </g>
      <path d={ROUND_HAIR} {...stroke} strokeWidth={4.8} />
      <g transform={`translate(132 128) scale(${sc})`}>
        {face.lid ? (
          <>
            <path d="M-14 0 C-11 3 -7 3 -4 0" {...stroke} />
            <path d="M4 0 C7 3 11 3 14 0" {...stroke} />
          </>
        ) : (
          <g className="buddy-eye-blink">
            <g className="buddy-look-position" style={{ transform: `translate(${ex}px, ${ey}px)` }}>
              <g className="buddy-gaze">
                <circle cx="-9" cy="0" r="3.6" fill={INK} />
                <circle cx="9" cy="0" r="3.6" fill={INK} />
              </g>
            </g>
          </g>
        )}
        <g className="buddy-mouth-motion">
          <path d={ROUND_MOUTH[face.mouth]} {...stroke} />
        </g>
      </g>
    </>
  );
}

export default function Buddy({
  shape = "cloud",
  color = "lavender",
  size,
  state = "idle",
  look,
  mouth,
  lid,
  bob = false,
  className = "",
}: {
  shape?: ShapeId;
  color?: ColorId;
  size: number;
  state?: BuddyState;
  look?: Look;
  mouth?: Mouth;
  lid?: boolean;
  bob?: boolean;
  className?: string;
}) {
  const id = `buddy${useId().replace(/[^a-zA-Z0-9]/g, "")}`; // useId의 특수문자는 url(#…)에서 깨질 수 있다
  const c = COLORS.find((x) => x.id === color) ?? COLORS[0];
  const preset = STATE_FACE[state];
  const face: Face = { look: look ?? preset.look, mouth: mouth ?? preset.mouth, lid: lid ?? preset.lid };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      overflow="visible"
      aria-hidden="true"
      data-state={state}
      data-mouth={face.mouth}
      data-look-override={look !== undefined ? "true" : undefined}
      data-bob={bob ? "true" : undefined}
      className={`buddy ${className}`}
    >
      <defs>
        <filter id={`${id}-soft`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={shape === "round" ? 24 : 20} />
        </filter>
        <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>
      <g className="buddy-pose">
        <g className="buddy-body-motion">
          {shape === "round" ? <RoundBody c={c} face={face} id={id} /> : <CloudBody c={c} face={face} id={id} />}
        </g>
      </g>
    </svg>
  );
}
