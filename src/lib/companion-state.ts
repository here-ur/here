// 입력 내용의 감정을 추측하지 않고, 실제 UI/연결 상태만 표정으로 옮긴다.
export function companionState(input: {
  error?: boolean;
  connecting?: boolean;
  thinking?: boolean;
  speaking?: boolean;
  listening?: boolean;
  composing?: boolean;
}) {
  if (input.error) return "idle" as const;
  if (input.connecting || input.thinking) return "thinking" as const;
  if (input.speaking) return "speaking" as const;
  if (input.listening) return "listening" as const;
  if (input.composing) return "attentive" as const;
  return "idle" as const;
}
