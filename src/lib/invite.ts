export function normalizeInviteCode(value: string): string | null {
  const code = value.replace(/[\s-]/g, "").toUpperCase();
  return /^[0-9A-F]{16}$/.test(code) ? code : null;
}

export function normalizePhone(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, "");
  const phone = /^010\d{8}$/.test(compact) ? `+82${compact.slice(1)}` : compact;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
