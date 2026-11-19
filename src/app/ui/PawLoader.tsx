/** 기다리는 동안 차례로 깜박이는 발자국 세 개. 버튼 안(글자 대신), 화면 안 작은 자리, 고양이 로딩 장면에서 같이 쓴다.
 * label이 있으면 화면 읽기 프로그램에 읽어 주고, 없으면 장식으로 숨긴다. 동작 줄이기에서는 위아래로 움직이지 않고 흐려졌다 진해지기만 한다. */
export function PawPrint({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <ellipse cx="12" cy="16" rx="5.2" ry="4.4" />
      <ellipse cx="5.2" cy="10" rx="2.1" ry="2.6" />
      <ellipse cx="9.3" cy="6.4" rx="2.1" ry="2.7" />
      <ellipse cx="14.7" cy="6.4" rx="2.1" ry="2.7" />
      <ellipse cx="18.8" cy="10" rx="2.1" ry="2.6" />
    </svg>
  );
}

export function PawLoader({ size = 12, gap = 6, still = false, label, className = "" }: {
  size?: number;
  gap?: number;
  /** 동작 줄이기 장면처럼 움직이지 않고 천천히 흐려졌다 진해지기만 할 때 */
  still?: boolean;
  label?: string;
  className?: string;
}) {
  const a11y = label ? { role: "status", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <span {...a11y} className={`here-paws ${className}`} data-still={still || undefined} style={{ gap }}>
      <span><PawPrint size={size} /></span>
      <span><PawPrint size={size} /></span>
      <span><PawPrint size={size} /></span>
    </span>
  );
}
