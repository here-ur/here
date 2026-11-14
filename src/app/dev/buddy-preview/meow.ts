// 처음 홈 진입 '냐옹' 효과음 시안. 팀이 들어 보고 정하기 위한 개발용 소리이며 실제 홈에는 붙이지 않았다.
// 소리 파일 없이 Web Audio로 만든다: 톱니파(성대) → 세 개의 공명 필터(모음) → 부드러운 저역 필터.
// 'ㄴ(코 막힌 소리) → ㅑ → ㅏ → ㅗ'로 공명 위치를 옮기고, 음높이는 올라갔다 내려온다.
// 실제 고양이 녹음보다 기계적으로 들린다. 넣기로 하면 직접 녹음하거나 상업 사용 가능한 파일로 바꾼다.

export type MeowKind = "lazy" | "basic" | "long";

type Point = [at: number, value: number]; // at: 0~1 (소리 길이 비율)

type MeowShape = {
  label: string;
  note: string;
  duration: number;
  peak: number;
  pitch: Point[];
};

export const MEOWS: Record<MeowKind, MeowShape> = {
  lazy: { label: "냥", note: "낮고 짧게, 나른한 한 번", duration: 0.42, peak: 0.12, pitch: [[0, 430], [0.3, 520], [1, 370]] },
  basic: { label: "냐옹~", note: "올라갔다 내려오는 기본", duration: 0.75, peak: 0.14, pitch: [[0, 560], [0.35, 820], [0.7, 700], [1, 470]] },
  long: { label: "냐아아옹", note: "길게 늘어지는 기지개", duration: 1.15, peak: 0.12, pitch: [[0, 520], [0.25, 760], [0.6, 720], [1, 410]] },
};

// 모음 공명(F1·F2, Hz). ㄴ에서 ㅑ로 올라갔다가 ㅏ를 지나 ㅗ로 닫힌다.
const VOWELS: { at: number; f1: number; f2: number }[] = [
  { at: 0, f1: 300, f2: 1200 },
  { at: 0.1, f1: 450, f2: 2300 },
  { at: 0.42, f1: 950, f2: 1500 },
  { at: 0.85, f1: 600, f2: 950 },
  { at: 1, f1: 520, f2: 850 },
];

function ramp(param: AudioParam, points: Point[], start: number, duration: number) {
  param.setValueAtTime(points[0][1], start);
  for (const [at, value] of points.slice(1)) param.linearRampToValueAtTime(value, start + at * duration);
}

/** 냐옹을 한 번 울리고 소리 길이(초)를 돌려준다. destination을 주면 그쪽으로 보낸다(입 모양 분석용). */
export function playMeow(ac: AudioContext, kind: MeowKind, { volume = 1, destination }: { volume?: number; destination?: AudioNode } = {}): number {
  const shape = MEOWS[kind];
  const start = ac.currentTime + 0.02;
  const { duration } = shape;
  const end = start + duration;

  const voice = ac.createOscillator();
  voice.type = "sawtooth";
  ramp(voice.frequency, shape.pitch, start, duration);

  // 살짝 떨리는 목소리
  const vibrato = ac.createOscillator();
  const vibratoDepth = ac.createGain();
  vibrato.frequency.value = 5.5;
  vibratoDepth.gain.value = 9;
  vibrato.connect(vibratoDepth).connect(voice.frequency);

  // 숨소리: 높은 쪽 노이즈를 아주 조금
  const noise = ac.createBufferSource();
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * (duration + 0.1)), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;
  const breathFilter = ac.createBiquadFilter();
  breathFilter.type = "highpass";
  breathFilter.frequency.value = 3000;
  const breath = ac.createGain();
  breath.gain.value = 0.04;
  noise.connect(breathFilter).connect(breath);

  // 공명 필터 세 개를 나란히 두고 합친다.
  const mix = ac.createGain();
  const formant = (q: number, level: number, path?: "f1" | "f2", fixed = 0) => {
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = q;
    if (path) ramp(filter.frequency, VOWELS.map((v) => [v.at, v[path]]), start, duration);
    else filter.frequency.value = fixed;
    const gain = ac.createGain();
    gain.gain.value = level;
    voice.connect(filter).connect(gain).connect(mix);
    breath.connect(filter);
  };
  formant(6, 1, "f1");
  formant(9, 0.7, "f2");
  formant(10, 0.25, undefined, 3200);

  // 소리 크기: ㄴ에서 작게 시작해 올라가고, 끝 30%에서 부드럽게 꺼진다.
  const envelope = ac.createGain();
  const peak = shape.peak * volume;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(peak * 0.4, start + 0.04);
  envelope.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.12, duration * 0.3));
  envelope.gain.setValueAtTime(peak, start + duration * 0.7);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);

  const soften = ac.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 4500;

  mix.connect(envelope).connect(soften).connect(destination ?? ac.destination);

  for (const node of [voice, vibrato, noise]) {
    node.start(start);
    node.stop(end + 0.05);
  }
  voice.onended = () => soften.disconnect();
  return duration;
}
