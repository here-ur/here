// Versioned development draft. This is NOT an approved production privacy policy.
export const MEMORY_CONSENT_VERSION = "2026-11-28-dev-v3";
export function validMemoryConsent(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const value = body as Record<string, unknown>;
  return value.version === MEMORY_CONSENT_VERSION && value.privacy === true && value.sensitive === true;
}

/** 동의 항목의 전문(화면의 '보기'). 문구를 바꾸면 MEMORY_CONSENT_VERSION도 올린다. [소제목, 본문] 순서이고 첫째가 개인정보, 둘째가 민감정보다. */
// Structure references (reviewed 2026-11-28):
// https://fe-web-assets.static.wrtn.ai/sso/policy/KR/privacy_20261021.html
// https://docs.wrks.ai/policies/privacy
// Only Here conversation/memory/activity scope is included; no marketing or model-training consent.
// Release follow-up: owner retained the one-year post-withdrawal period; its purpose/legal basis is pending.
// Provider identities, subprocessors and overseas transfers belong in the separate privacy notice.
// Exception (2026-11-28, user decision): the separate notice will live on the landing page later, so the
// PostHog usage-analytics item is added here. Wording only; v3 kept on purpose (no DB version bump).
export const MEMORY_CONSENT_DETAILS: readonly (readonly (readonly [string, string])[])[] = [
  [
    ["수집·이용 목적", "AI 대화 및 맞춤형 답변 제공, 이전 대화의 맥락 유지, 대화·활동 기록의 저장 및 조회, 동의 여부 확인, 서비스 이용 분석 및 개선"],
    ["수집·이용 항목", "계정 식별자, 텍스트 대화 및 음성을 문자로 변환한 내용, 대화 요약과 기억 검색 정보, 기록 생성 일시, 정원·라이브러리의 활동 통계 및 선택·실천 기록, 동의·철회 이력, 서비스 이용 기록(화면 이동·기능 사용·오류 여부·음성 대화 길이)과 기기·브라우저 정보"],
    ["보유·이용 기간", "텍스트 대화와 음성 자막은 생성일로부터 30일간 보관합니다. 대화 요약과 기억 검색 정보는 원문과 별도로 보관하며, 정원·라이브러리는 최근 1년의 활동 기록을 관리합니다. 탈퇴 신청 후 7일이 지나면 탈퇴가 확정되며, 계정에 남아 있는 정보는 탈퇴 확정일로부터 1년간 보관한 후 삭제합니다."],
    ["대화 정보의 처리", "대화 내용은 AI 응답 생성과 대화 요약·기억 검색에 이용됩니다. 이 과정에서 외부 AI 서비스를 통해 처리됩니다. 음성 파일 자체는 here의 대화 기록으로 저장하지 않습니다. 이번 동의에는 공용 AI 모델 학습을 위한 이용이 포함되지 않습니다."],
    ["서비스 이용 기록 분석", "서비스를 개선하기 위해 앱 안에서의 이용 기록과 기기·브라우저 정보를 PostHog(미국)로 보내 분석합니다. 대화 내용, 이름, 건강 관련 정보는 보내지 않으며, 계정은 알아볼 수 없도록 변환한 식별값으로만 구분합니다."],
    ["동의 거부 및 철회", "개인정보 수집·이용에 동의하지 않을 권리가 있습니다. 다만, 동의하지 않으면 AI 대화 및 기억 기능을 이용할 수 없습니다. 동의를 철회하면 저장된 대화와 기억 정보가 삭제됩니다."],
  ],
  [
    ["처리 목적", "이용자가 이야기한 내용을 반영한 AI 답변 제공 및 이전 대화의 맥락 유지"],
    ["처리 항목", "이용자가 대화에서 직접 입력하거나 음성으로 전달한 정신·신체 건강 관련 정보와 해당 내용이 포함된 대화 요약·기억 검색 정보"],
    ["보유·이용 기간", "건강 정보가 포함된 텍스트 대화와 음성 자막은 생성일로부터 30일간 보관합니다. 해당 내용이 포함된 대화 요약과 기억 검색 정보는 원문과 별도로 보관하며, 탈퇴 확정일로부터 1년간 보관한 후 삭제합니다. 동의 철회 시 저장된 대화와 기억 정보는 삭제됩니다."],
    ["동의 거부 및 철회", "민감정보 처리에 동의하지 않을 권리가 있습니다. 다만, 동의하지 않으면 AI 대화 및 기억 기능을 이용할 수 없습니다. 건강 정보는 이용자가 직접 이야기한 범위에서 처리하며, 이번 동의에는 공용 AI 모델 학습을 위한 이용이 포함되지 않습니다."],
  ],
];
/** 동의 화면 아래의 안내(가운뎃점에서 줄을 나눈다). */
export const MEMORY_CONSENT_NOTE = "거부할 수 있지만, 동의해야 대화를 시작할 수 있어요 · 테스트용 초안이라 실제 정보는 쓰지 마세요";
