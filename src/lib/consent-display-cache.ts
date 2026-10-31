import { MEMORY_CONSENT_VERSION } from "./memory-consent.ts";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
// A display hint, never an authorization grant. All APIs still check server consent.
export function consentDisplayKey(userId: string) {
  return `here:consent-display:${userId}`;
}
export function hasConsentDisplayHint(storage: StorageLike | undefined, userId: string): boolean {
  if (!userId) return false;
  try { return storage?.getItem(consentDisplayKey(userId)) === MEMORY_CONSENT_VERSION; }
  catch { return false; }
}
export function setConsentDisplayHint(storage: StorageLike | undefined, userId: string, accepted: boolean) {
  if (!userId) return;
  try {
    if (accepted) storage?.setItem(consentDisplayKey(userId), MEMORY_CONSENT_VERSION);
    else storage?.removeItem(consentDisplayKey(userId));
  } catch { /* Storage can be unavailable; server confirmation still works. */ }
}
export function consentDisplayStorage(): Storage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; }
  catch { return undefined; }
}
