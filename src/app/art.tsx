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

const PATHS = {
  down: <path d="M6 9.5l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  back: <path d="M14.5 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  log: <path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  mic: (
    <>
      <rect x="8.6" y="2.8" width="6.8" height="11.6" rx="3.4" stroke="currentColor" strokeWidth="2.2" />
      <path d="M5.2 11.2a6.8 6.8 0 0 0 13.6 0M12 18v3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.6" fill="currentColor" />,
  micOff: (
    <>
      <rect x="8.6" y="2.8" width="6.8" height="11.6" rx="3.4" stroke="currentColor" strokeWidth="2.2" />
      <path d="M5.2 11.2a6.8 6.8 0 0 0 13.6 0M12 18v3M3.5 3.5l17 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.6" y="5.6" width="18.8" height="12.8" rx="3.6" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="7" cy="10" r="1.25" fill="currentColor" />
      <circle cx="10.4" cy="10" r="1.25" fill="currentColor" />
      <circle cx="13.7" cy="10" r="1.25" fill="currentColor" />
      <circle cx="17" cy="10" r="1.25" fill="currentColor" />
      <path d="M8.4 14.2h7.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  soundOn: (
    <>
      <path d="M3.6 9.6h3.1l4.4-3.6c.5-.4 1.2 0 1.2.6v10.8c0 .6-.7 1-1.2.6l-4.4-3.6H3.6c-.5 0-.9-.4-.9-.9v-3c0-.5.4-.9.9-.9z" fill="currentColor" />
      <path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.4 6.6a7.8 7.8 0 0 1 0 10.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  soundOff: (
    <>
      <path d="M3.6 9.6h3.1l4.4-3.6c.5-.4 1.2 0 1.2.6v10.8c0 .6-.7 1-1.2.6l-4.4-3.6H3.6c-.5 0-.9-.4-.9-.9v-3c0-.5.4-.9.9-.9z" fill="currentColor" />
      <path d="M16.2 9.6l4.8 4.8M21 9.6l-4.8 4.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  send: <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />,
  hangUp: (
    <path
      d="M3.2 14.6c4.9-4.6 12.7-4.6 17.6 0 .5.5.6 1.3.2 1.9l-1.3 1.8c-.4.6-1.2.8-1.9.5l-2.6-1.2c-.5-.3-.9-.8-.9-1.4v-1.6a12.4 12.4 0 0 0-4.6 0v1.6c0 .6-.4 1.1-.9 1.4l-2.6 1.2c-.7.3-1.5.1-1.9-.5L3 16.5c-.4-.6-.3-1.4.2-1.9z"
      fill="currentColor"
    />
  ),
  captions: (
    <>
      <rect x="2.8" y="5.2" width="18.4" height="13.6" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M10.6 10.2a2.4 2.4 0 1 0 0 3.6M17.4 10.2a2.4 2.4 0 1 0 0 3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.6" stroke="currentColor" strokeWidth="2" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="7.9" r="1.2" fill="currentColor" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" stroke="currentColor" strokeWidth="2" />
    </>
  ),
  phone: (
    <path
      d="M6.6 3.8h2.5l1.3 4-1.9 1.4a11 11 0 0 0 6.3 6.3l1.4-1.9 4 1.3v2.5a2 2 0 0 1-2.2 2A16.2 16.2 0 0 1 4.6 6a2 2 0 0 1 2-2.2z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  ),
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  pin: (
    <>
      <path d="M12 21s-6.6-5.6-6.6-11a6.6 6.6 0 0 1 13.2 0c0 5.4-6.6 11-6.6 11z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="2" />
    </>
  ),
};

export function Icon({ name, size = 24 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="block">
      {PATHS[name]}
    </svg>
  );
}
