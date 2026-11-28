// The unused legacy key-issuance path would bypass account voice-time limits.
// Confirmed unused by the product owner on 2026-11-28.
export async function POST() {
  return Response.json({
    error: '이 음성 연결 방식은 더 이상 지원하지 않아요. 화면을 새로고침한 뒤 다시 시작해 주세요.',
    code: 'legacy_voice_disabled',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
