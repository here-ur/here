import type { RefObject } from "react";
import { useCatStroll } from "./use-cat-stroll";
import CatFace from "./CatFace";
import type { CatExpression } from "@/lib/cat-expression";
import { type ColorId, type ShapeId } from "@/lib/onboarding";
import "./buddy-motion.css";

// Keep legacy profile props compatible; the MVP has one fixed cat appearance.
export type Look = readonly [number, number];
export type Mouth = "smile" | "tongue" | "o" | "calm";
export type BuddyState = "idle" | "attentive" | "listening" | "thinking" | "speaking";

// 구름 정원에서 연 꾸미기 아이템. 기존 위치와 크기를 유지한다.
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
  size, state = "idle", look, mouth, className = "", hearing, accessory, expression = "neutral", outputLevel, stroll = false, groundShadow = false,
}: {
  accessory?: AccessoryId | string;
  cheer?: number;
  shape?: ShapeId;
  color?: ColorId;
  size: number;
  state?: BuddyState;
  look?: Look;
  mouth?: Mouth;
  lid?: boolean;
  bob?: boolean; // Legacy API: floating is intentionally no longer used.
  className?: string;
  tap?: number;
  hearing?: boolean;
  voice?: boolean;
  expression?: CatExpression;
  outputLevel?: RefObject<number>;
  stroll?: boolean;
  groundShadow?: boolean;
}) {
  const root = useCatStroll(stroll && state === "idle");
  return (
    <svg ref={root} width={size} height={size} viewBox="0 0 240 240" overflow="visible" aria-hidden="true"
      data-state={state} data-character="black-cat" data-expression={expression}
      data-look-override={look !== undefined ? "true" : undefined} data-hearing={hearing || undefined}
      className={`buddy ${className}`}>
      <g className="cat-travel">
      {groundShadow && <ellipse cx="120" cy="204" rx="53" ry="3" fill="#2D261A" opacity=".09" />}
      <g className="cat-step-weight">
      <CatFace outputLevel={outputLevel} state={state} expression={expression} look={look} mouth={mouth} />
      {accessory && ["sprout", "hat", "scarf", "flowers", "crown", "rainbow"].includes(accessory) && <Accessory id={accessory as AccessoryId} shape="round" />}
      </g></g>
    </svg>
  );
}
