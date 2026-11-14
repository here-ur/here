export const MIN_PASSWORD_LENGTH = 8;

export function passwordSetupError(password: string, confirmation: string): string | null {
  if (Array.from(password).length < MIN_PASSWORD_LENGTH) return `비밀번호를 ${MIN_PASSWORD_LENGTH}자 이상 입력해 주세요.`;
  if (password !== confirmation) return "두 비밀번호가 일치하지 않아요.";
  return null;
}
