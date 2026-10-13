import { CommonActions, type NavigationProp } from "@react-navigation/native";
import type { RootStackParamList } from "../../navigation";
import { getUserProfile, setSkillCheckPending, setUserProfile } from "../prefs/prefsStore";
import { EMPTY_PROFILE } from "../../domain/profile";
import { todayISODate } from "../../utils/dateUtils";
import { getDatabase } from "../db/database";

// Marks onboarding finished. With the skill check put off, Today shows it as
// tomorrow's first session instead.
export function completeOnboarding(options: { deferSkillCheck?: boolean } = {}): void {
  const profile = getUserProfile() ?? EMPTY_PROFILE(todayISODate());
  setUserProfile({ ...profile, onboardingCompletedAt: profile.onboardingCompletedAt ?? new Date().toISOString() });
  setSkillCheckPending(!!options.deferSkillCheck);
}

export function resetToTabs(navigation: NavigationProp<RootStackParamList>): void {
  navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Tabs" }] }));
}

// Practice from before onboarding existed: the gate offers to start fresh or
// keep it (keeping skips onboarding; Progress then offers the profile
// questions and a skill check).
export async function hasPracticeHistory(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM sessions WHERE deleted_at IS NULL) + (SELECT COUNT(*) FROM drill_attempts) AS n`,
  );
  return (row?.n ?? 0) > 0;
}
