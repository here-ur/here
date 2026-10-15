// AI 판단과 별개로 서버에서 먼저 거르는 위기 표현. 하나라도 걸리면 109 안내를 띄운다.
// ponytail: 키워드 매칭이라 돌려 말하는 표현은 놓친다. AI의 crisis 판단(chat route)이 그 빈틈을 메운다.
const PATTERNS = [
  /자살/,
  /자해/,
  /죽고\s*싶/,
  /죽어\s*버리/,
  /죽을\s*래/,
  /살기\s*싫/,
  /살고\s*싶지\s*않/,
  /사라지고\s*싶/,
  /없어지고\s*싶/,
  /극단적\s*(인\s*)?선택/,
  /목숨을?\s*끊/,
  /뛰어\s*내리/,
  /손목을?\s*긋/,
  /유서/,
];

export function hasCrisisSignal(text: string): boolean {
  return PATTERNS.some((p) => p.test(text));
}
