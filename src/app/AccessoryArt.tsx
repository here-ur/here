import type { AccessoryId } from "@/lib/garden";

// 꾸미기 아이템을 카드·탭 아이콘으로 보여 주는 그림(80×80). 색과 모양은 Buddy가 고양이 위에 그리는 것과 같다.
const FLOWER_FILLS = ["#F6B4E4", "#FFFFFF", "#F9A8B8", "#FFFFFF", "#F6B4E4"];
const RAINBOW = ["#F9A8B8", "#FFD66B", "#9AD6B0", "#8EB4FF"];

function Art({ id }: { id: AccessoryId }) {
  switch (id) {
    case "sprout":
      return <g transform="translate(40 66) rotate(10)"><path d="M0 0v-26" stroke="#4E9E6E" strokeWidth="5" strokeLinecap="round" /><path d="M0-18c-16-3-22-16-16-24 11 0 18 11 16 24Z" fill="#7BC59A" /><path d="M0-20c13-5 21-16 16-24-11 0-18 10-16 24Z" fill="#9AD6B0" /></g>;
    case "hat":
      return <g transform="translate(40 58)"><path d="M-30 0c0-22 13-34 30-34s30 12 30 34Z" fill="#E5484D" /><rect x="-33" y="-4" width="66" height="11" rx="5.5" fill="#F7F1EC" /><circle cy="-36" r="7" fill="#F7F1EC" /></g>;
    case "scarf":
      return <g transform="translate(4 18)"><path d="M6 12q34 21 64 0" stroke="#E8A23C" strokeWidth="13" fill="none" strokeLinecap="round" /><path d="M52 24l8 25" stroke="#E8A23C" strokeWidth="12" strokeLinecap="round" /><path d="M52 24l8 25" stroke="#F5C27A" strokeWidth="3" strokeDasharray="4 6" /></g>;
    case "flowers":
      return (
        <g transform="translate(40 44)">
          {[-26, -13, 0, 13, 26].map((x, i) => (
            <g key={x} transform={`translate(${x} ${Math.abs(x) * 0.25 - 4})`}>
              {[0, 72, 144, 216, 288].map((d) => <circle key={d} cx={Math.cos((d * Math.PI) / 180) * 5} cy={Math.sin((d * Math.PI) / 180) * 5} r={4.2} fill={FLOWER_FILLS[i]} stroke="#EAD9E4" strokeWidth=".6" />)}
              <circle r={3.2} fill="#FFD66B" />
            </g>
          ))}
        </g>
      );
    case "crown":
      return <g transform="translate(40 52) scale(1.25)"><path d="M-24 4l-4-26 14 12 14-20 14 20 14-12-4 26Z" fill="#FFD66B" stroke="#E8A23C" strokeWidth="2.5" strokeLinejoin="round" /><circle cy="-6" r="3.5" fill="#F6B4E4" /></g>;
    case "rainbow":
      return (
        <g transform="translate(46 52) scale(1.5)">
          {RAINBOW.map((c, i) => <path key={c} d={`M${-16 + i * 2} ${-4 - i * 3}q-14-12 0-16q8 2 ${16 - i * 2} ${16 + i * 3}`} fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" />)}
          <circle r="4" fill="#fff" stroke="#E6E8EF" />
        </g>
      );
  }
}

export default function AccessoryArt({ id, size = 58, className }: { id: AccessoryId; size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true" className={className}><Art id={id} /></svg>;
}
