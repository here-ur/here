/** Public application errors only; provider messages and account details stay server-side. */
const messages: Record<string, string> = {
  voice_provider_quota: '음성 서비스 이용 한도로 연결할 수 없어요. 글 대화를 이용해 주세요.',
  voice_provider_busy: '지금 음성 연결이 몰리고 있어요. 잠시 후 다시 눌러 주세요.',
  consent_required: '개인정보 이용 동의를 먼저 확인해 주세요.',
  context_unavailable: '대화 맥락을 불러오지 못했어요. 잠시 뒤 다시 연결해 주세요.',
};

export function voiceConnectionErrorMessage(status: number, code?: unknown): string {
  if (typeof code === 'string' && Object.hasOwn(messages, code)) return messages[code];
  if (status === 401) return '로그인이 만료됐어요. 다시 로그인해 주세요.';
  if (status === 429) return '음성 대화 이용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.';
  return '음성 대화를 연결하지 못했어요. 잠시 후 다시 눌러 주세요.';
}
