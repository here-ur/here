import { prepareLiveSession } from './live-preconnect.ts';
import { cleanName, pickOnboardingAnswers } from './onboarding.ts';

export function voiceProfileKey(name: unknown, answers: unknown) {
  return JSON.stringify([cleanName(typeof name === 'string' ? name : ''), pickOnboardingAnswers(answers)]);
}

/** One app-instance/account-specific handoff from entry checks to the home screen. */
export function createVoicePreparationOwner(prepare = prepareLiveSession) {
  let entry: { userId: string; profileKey: string; value: ReturnType<typeof prepareLiveSession> } | undefined;
  const clear = () => { entry?.value.dispose(); entry = undefined; };
  return {
    prepare(userId: string, profileKey: string, token: () => Promise<string>) {
      if (entry?.userId === userId && entry.profileKey === profileKey) return;
      clear();
      entry = { userId, profileKey, value: prepare(token) };
    },
    take(userId: string, profileKey: string) {
      if (entry?.userId !== userId || entry.profileKey !== profileKey) { clear(); return null; }
      const value = entry.value;
      entry = undefined;
      return value;
    },
    clear,
  };
}
