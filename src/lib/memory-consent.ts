// Versioned development draft. This is NOT an approved production privacy policy.
export const MEMORY_CONSENT_VERSION = "2026-11-16-dev-v2";
export function validMemoryConsent(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const value = body as Record<string, unknown>;
  return value.version === MEMORY_CONSENT_VERSION && value.privacy === true && value.sensitive === true;
}
