import { useState } from "react";
import { type TransitionCue, transitionCue } from "@/lib/buddy-cues";
import { type ColorId, type ShapeId } from "@/lib/onboarding";
import "./buddy-motion.css";

// Keep legacy profile props compatible; the MVP has one fixed cat appearance.
export type Look = readonly [number, number];
export type Mouth = "smile" | "tongue" | "o" | "calm";
export type BuddyState = "idle" | "attentive" | "listening" | "thinking" | "speaking";

function CatBody() {
  return (
    <svg x="20" y="32" width="200" height="184" viewBox="280 100 970 890" overflow="visible">
      {/* Original transparent artwork, framed without stretching or recoloring. */}
      <image href="/characters/black-cat.png" width="1536" height="1024" />
    </svg>
  );
}

// 구름 정원에서 연 꾸미기 아이템. 몸 움직임과 함께 흔들리도록 몸 그룹 안에 그린다.
type AccessoryId = "sprout" | "hat" | "scarf" | "flowers" | "crown" | "rainbow";
function Accessory({ id, shape }: { id: AccessoryId; shape: ShapeId }) {
  const head = shape === "round" ? { x: 120, y: 50, r: 0 } : { x: 150, y: 66, r: -6 };
  const side = shape === "round" ? { x: 172, y: 64 } : { x: 188, y: 100 };
  const flower = (x: number, y: number, fill: string, key: number) => (
    <g key={key} transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((d) => <circle key={d} cx={Math.cos((d * Math.PI) / 180) * 5} cy={Math.sin((d * Math.PI) / 180) * 5} r={4.2} fill={fill} />)}
      <circle r={3.2} fill="#FFD66B" />
    </g>
  );
  switch (id) {
    case "sprout":
      return <g transform={`translate(${side.x} ${side.y}) rotate(18)`}><path d="M0 0v-16" stroke="#4E9E6E" strokeWidth="4" strokeLinecap="round" /><path d="M0-12c-12-2-16-12-12-18 8 0 13 8 12 18Z" fill="#7BC59A" /><path d="M0-14c10-4 16-12 12-18-8 0-13 7-12 18Z" fill="#9AD6B0" /></g>;
    case "hat":
      return <g transform={`translate(${head.x} ${head.y}) rotate(${head.r})`}><path d="M-30 0c0-22 13-34 30-34s30 12 30 34Z" fill="#E5484D" /><rect x="-33" y="-4" width="66" height="11" rx="5.5" fill="#F7F1EC" /><circle cy="-36" r="7" fill="#F7F1EC" /></g>;
    case "scarf":
      return shape === "round"
        ? <g><path d="M60 182q60 26 120 0" stroke="#E8A23C" strokeWidth="15" fill="none" strokeLinecap="round" /><path d="M150 192l8 30" stroke="#E8A23C" strokeWidth="13" strokeLinecap="round" /><path d="M150 192l8 30" stroke="#F5C27A" strokeWidth="3" strokeDasharray="4 6" /></g>
        : <g><path d="M56 170q68 18 140-4" stroke="#E8A23C" strokeWidth="15" fill="none" strokeLinecap="round" /><path d="M164 172l10 30" stroke="#E8A23C" strokeWidth="13" strokeLinecap="round" /><path d="M164 172l10 30" stroke="#F5C27A" strokeWidth="3" strokeDasharray="4 6" /></g>;
    case "flowers":
      return <g transform={`translate(${head.x} ${head.y + 2}) rotate(${head.r})`}>{[-30, -15, 0, 15, 30].map((x, i) => flower(x, Math.abs(x) * 0.25 - 4, ["#F6B4E4", "#FFFFFF", "#F9A8B8", "#FFFFFF", "#F6B4E4"][i], i))}</g>;
    case "crown":
      return <g transform={`translate(${head.x} ${head.y - 4}) rotate(${head.r})`}><path d="M-24 4l-4-26 14 12 14-20 14 20 14-12-4 26Z" fill="#FFD66B" stroke="#E8A23C" strokeWidth="2.5" strokeLinejoin="round" /><circle cy="-6" r="3.5" fill="#F6B4E4" /></g>;
    case "rainbow":
      return <g transform={`translate(${side.x} ${side.y}) rotate(14)`}>{["#F9A8B8", "#FFD66B", "#9AD6B0", "#8EB4FF"].map((c, i) => <path key={c} d={`M${-16 + i * 2} ${-4 - i * 3}q-14-12 0-16q8 2 ${16 - i * 2} ${16 + i * 3}`} fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" />)}<circle r="4" fill="#fff" stroke="#E6E8EF" /></g>;
  }
}

export default function Buddy({
  size,
  state = "idle",
  look,
  bob = false,
  className = "",
  tap,
  hearing,
  voice,
  accessory,
  cheer,
}: {
  accessory?: AccessoryId | string; // 구름 정원에서 연 꾸미기 아이템
  cheer?: number; // 실천 체크처럼 작은 기쁨이 생길 때마다 바뀌는 값. 말하기 시작 때와 같은 '통' 튀기를 한 번 쓴다
  shape?: ShapeId;
  color?: ColorId;
  size: number;
  state?: BuddyState;
  look?: Look;
  mouth?: Mouth;
  lid?: boolean;
  bob?: boolean;
  className?: string;
  tap?: number; // 글을 칠 때마다 바뀌는 값(글자 수). 주목 상태에서 아주 작게 반응한다
  hearing?: boolean; // 음성에서 사용자가 말하는 중. 말을 시작·멈추는 순간에 반응한다
  voice?: boolean; // 음성 대화 중. 끝나는 순간 짧게 작별 몸짓을 한다
}) {
  // 상태·입력이 바뀐 순간에만 한 번 움직인다. 렌더 중에 이전 값과 비교하고, 동작이 끝나면 지운다.
  const [prev, setPrev] = useState({ state, tap, hearing, voice, cheer });
  const [cue, setCue] = useState<TransitionCue | "bye" | null>(null);
  const [react, setReact] = useState<string | null>(null);
  if (prev.state !== state || prev.tap !== tap || prev.hearing !== hearing || prev.voice !== voice || prev.cheer !== cheer) {
    if (prev.voice && !voice) setCue("bye");
    else if (prev.state !== state) setCue(transitionCue(prev.state, state));
    else if (prev.cheer !== cheer && cheer !== undefined && prev.cheer !== undefined) setCue("pop");
    if (prev.hearing !== hearing && hearing !== undefined && prev.hearing !== undefined && state === "listening") setReact(hearing ? "hear-start" : "hear-stop");
    else if (prev.tap !== tap && tap !== undefined && prev.tap !== undefined && state === "attentive") setReact(react === "tap-a" ? "tap-b" : "tap-a");
    setPrev({ state, tap, hearing, voice, cheer });
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      overflow="visible"
      aria-hidden="true"
      data-state={state}
      data-character="black-cat"
      data-look-override={look !== undefined ? "true" : undefined}
      data-bob={bob ? "true" : undefined}
      className={`buddy ${className}`}
    >
      {/* 늦게 도착한 이전 동작의 끝 신호가 다음 동작을 지우지 않게, 지금 붙은 동작이 끝났을 때만 지운다. */}
      <g className="buddy-cue" data-cue={cue ?? undefined} onAnimationEnd={(event) => { if (event.target === event.currentTarget && event.animationName === `buddy-cue-${cue}`) setCue(null); }}>
        <g className="buddy-react" data-react={react ?? undefined} onAnimationEnd={(event) => { if (event.target === event.currentTarget && react?.startsWith("hear") && event.animationName === `buddy-${react}`) setReact(null); }}>
          <g className="buddy-pose">
            <g className="buddy-wait">
              <g className="buddy-body-motion">
                <CatBody />
                {accessory && ["sprout", "hat", "scarf", "flowers", "crown", "rainbow"].includes(accessory) && <Accessory id={accessory as AccessoryId} shape="round" />}
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
