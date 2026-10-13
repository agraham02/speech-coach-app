import { getFreezeAnnouncedThrough, setFreezeAnnouncedThrough } from "../prefs/prefsStore";
import type { StreakState } from "../../domain/streaks";

// The message for a freeze that kept the streak alive and hasn't been
// mentioned yet, or null. Marks it as announced, so asking twice (opening
// Today, then finishing a session) only tells the user once.
export function takeFreezeNotice(state: StreakState): string | null {
  const latest = state.frozenDates[state.frozenDates.length - 1];
  if (!latest || state.currentStreak < 1 || latest <= getFreezeAnnouncedThrough()) return null;
  setFreezeAnnouncedThrough(latest);
  const left = state.freezesHeld === 0 ? "none left" : `${state.freezesHeld} left`;
  return `A freeze kept your ${state.currentStreak}-day streak · ${left}`;
}
