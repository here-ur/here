import FrameworkIcon from "framework7-react/components/icon.js";

// 몽글이 프로토타입의 그림(구름 캐릭터, 복숭아 언덕)과 아이콘을 그대로 옮긴 것.

const CLOUD = [
  { cx: 250, cy: 96, r: 15 },
  { cx: 266, cy: 80, r: 9 },
  { cx: 126, cy: 216, r: 60 },
  { cx: 274, cy: 208, r: 64 },
  { cx: 196, cy: 172, r: 80 },
];

function CloudShape({ fill }: { fill: string }) {
  return (
    <g transform="translate(0 -0.4) scale(1.1)">
      {CLOUD.map((c) => (
        <circle key={`${c.cx}-${c.cy}`} {...c} fill={fill} />
      ))}
      <ellipse cx="200" cy="262" rx="134" ry="76" fill={fill} />
    </g>
  );
}

export function Mongle({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 440 440" className={className} aria-hidden="true" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="mongle-fill" gradientUnits="userSpaceOnUse" x1="90" y1="70" x2="330" y2="370">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DCD5F8" />
        </linearGradient>
        <filter id="mongle-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.43  0 0 0 0 0.37  0 0 0 0 0.84  0 0 0 0.22 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <CloudShape fill="url(#mongle-fill)" />
      <g filter="url(#mongle-grain)">
        <CloudShape fill="#fff" />
      </g>
      <g transform="translate(0 -0.4) scale(1.1)">
        <g transform="translate(200 252)">
          <ellipse cx="-45" cy="13" rx="11" ry="7" fill="#FF9DB6" opacity="0.85" />
          <ellipse cx="45" cy="13" rx="11" ry="7" fill="#FF9DB6" opacity="0.85" />
          <circle cx="-25" cy="0" r="6.6" fill="#18181D" />
          <circle cx="25" cy="0" r="6.6" fill="#18181D" />
          <path d="M-12 19Q0 30.4 12 19" fill="none" stroke="#18181D" strokeWidth="6.5" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

// 프로토타입의 언덕 배치(390×324 기준). 첫 화면과 대화 화면이 조금 다르다.
const LAYOUT = {
  talk: {
    back: [[-110, 26, 270], [75, 50, 240], [246, 12, 260]],
    front: [[-50, 96, 240], [122, 122, 210], [262, 84, 230]],
    floor: 216,
  },
  splash: {
    back: [[-120, 20, 260], [80, 46, 230], [250, 8, 250]],
    front: [[-60, 86, 230], [118, 110, 200], [262, 76, 220]],
    floor: 150,
  },
};

export function Hills({ variant, className = "" }: { variant: keyof typeof LAYOUT; className?: string }) {
  const { back, front, floor } = LAYOUT[variant];
  const circle = ([x, y, d]: number[], fill: string) => (
    <circle key={`${x}-${y}`} cx={x + d / 2} cy={y + d / 2} r={d / 2} fill={fill} />
  );
  return (
    <svg viewBox="0 0 390 324" preserveAspectRatio="xMidYMin slice" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="hill-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD3C0" />
          <stop offset="1" stopColor="#FFC0AB" />
        </linearGradient>
        <linearGradient id="hill-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFEBDD" />
          <stop offset="1" stopColor="#FFD7C5" />
        </linearGradient>
      </defs>
      {back.map((c) => circle(c, "url(#hill-back)"))}
      <rect x="-200" y={floor} width="790" height="400" fill="#FFD7C5" />
      {front.map((c) => circle(c, "url(#hill-front)"))}
    </svg>
  );
}


const ICONS = {
  help: "bubble_left",
  down: "chevron_down",
  back: "chevron_left",
  log: "list_bullet",
  mic: "mic",
  stop: "stop_fill",
  micOff: "mic_slash",
  keyboard: "keyboard",
  soundOn: "speaker_2",
  soundOff: "speaker_slash",
  send: "arrow_up",
  hangUp: "phone_down",
  captions: "captions_bubble",
  info: "info_circle",
  lock: "lock",
  phone: "phone",
  close: "xmark",
  pin: "pin",
  add: "plus",
  menu: "line_horizontal_3",
  library: "book",
  sparkles: "sparkles",
  paintbrush: "paintbrush",
  pencil: "pencil",
} as const;

export function Icon({ name, size = 24 }: { name: keyof typeof ICONS; size?: number }) {
  return <FrameworkIcon f7={ICONS[name]} size={size} aria-hidden="true" />;
}
