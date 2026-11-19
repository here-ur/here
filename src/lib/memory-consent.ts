// Versioned development draft. This is NOT an approved production privacy policy.
export const MEMORY_CONSENT_VERSION = "2026-11-16-dev-v2";
export function validMemoryConsent(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const value = body as Record<string, unknown>;
  return value.version === MEMORY_CONSENT_VERSION && value.privacy === true && value.sensitive === true;
}

/** 동의 항목의 전문(화면의 '보기'). 문구를 바꾸면 MEMORY_CONSENT_VERSION도 올린다. [소제목, 본문] 순서이고 첫째가 개인정보, 둘째가 민감정보다. */
export const MEMORY_CONSENT_DETAILS: readonly (readonly (readonly [string, string])[])[] = [
  [
    ["목적", "회원 확인과 사용자별 대화 기억·맞춤 답변 제공"],
    ["항목", "계정 식별자, 최근 30일 텍스트 대화·음성 자막, 대화 요약, 기억 검색용 임베딩, 생성 시점과 동의 이력, 정원·라이브러리의 날짜별 통계와 하늘·씨앗 선택, 실천 기록. 카카오·구글 계정으로 로그인해요."],
    ["처리 방식", "텍스트 답변은 Runyour AI, 음성 대화와 받아쓰기는 OpenAI로 처리해요. 사용자와 캐릭터의 텍스트·음성 자막을 계정별로 Supabase에 30일 보관한 뒤 자동 삭제해요. 기기를 바꿔도 최근 대화를 이어 볼 수 있어요. 전체 대화는 구간별로 Runyour AI가 요약하고 OpenAI가 임베딩해요. 요약·임베딩은 개인화 기억으로 계속 보관하며 30일 원문 삭제와 별개예요. 정원·라이브러리 활동 기록은 계정에 최대 1년 보관해 다른 기기에서도 이어 볼 수 있어요. 음성 파일 자체는 저장하지 않아요."],
    ["보관기간 초안", "회원 탈퇴 전까지 보유하고 탈퇴 후 1년 보관하는 정책을 검토 중이에요. 탈퇴 후 보관 목적·근거, 자동 파기와 국외 처리 고지는 운영 전 확정해야 해요."],
    ["공용 모델 학습", "공용 모델 학습 동의는 이번 항목에 포함되지 않아요."],
  ],
  [["", "사용자가 직접 이야기한 정신·신체 건강 관련 내용이 요약과 기억에 포함될 수 있어요. 개인별 대화를 이어가기 위한 용도로 처리하며, 공용 모델 학습에는 자동으로 사용하지 않아요. 목적·보관기간은 위 초안과 같아요."]],
];
/** 동의 화면 아래의 안내(가운뎃점에서 줄을 나눈다). */
export const MEMORY_CONSENT_NOTE = "거부할 수 있지만, 동의해야 대화를 시작할 수 있어요 · 테스트용 초안이라 실제 정보는 쓰지 마세요";
