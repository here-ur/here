import type { SupabaseClient } from "@supabase/supabase-js";
import { parseProfile, type Profile } from "./onboarding.ts";

const FIELD = "here_profile_v1";

// Preferences only. Never use user-editable metadata for membership or consent.
export async function writeAccountProfile(client: SupabaseClient, userId: string, profile: Profile | null) {
  const { data: current, error: readError } = await client.auth.getUser();
  if (readError || current.user?.id !== userId) throw Error("profile_identity_unavailable");
  const { data, error } = await client.auth.updateUser({ data: { [FIELD]: { version: 1, profile } } });
  if (error || data.user?.id !== userId) throw Error("profile_save_failed");
}

export async function readAccountProfile(client: SupabaseClient, userId: string, local: Profile | null): Promise<Profile | null> {
  const { data, error } = await client.auth.getUser();
  if (error || data.user?.id !== userId) throw Error("profile_unavailable");
  const stored = data.user.user_metadata?.[FIELD];
  if (stored !== undefined && stored !== null) {
    if (stored.version !== 1) throw Error("profile_version_unknown");
    if (stored.profile === null) return null; // Explicit reset, never revive an old cache.
    const profile = parseProfile(JSON.stringify(stored.profile));
    if (!profile) throw Error("profile_invalid");
    return profile;
  }
  // Existing users keep their current cat; migrate only after confirming no cloud profile exists.
  if (local) await writeAccountProfile(client, userId, local);
  return local;
}
