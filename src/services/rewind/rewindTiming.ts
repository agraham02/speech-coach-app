import { getPracticeTimesSince } from "../db/activityLogRepo";
import { getRewindDates } from "../db/rewindRepo";
import { getRewindTime } from "../prefs/prefsStore";
import { dateOffset, decideRewindOffer, HABIT_DAYS, resolveRewindWindow, type RewindOffer, type RewindWindow } from "../../domain/rewind/rewindTiming";

// What Today (and the Rewind screens) ask: when do you practise, and which day
// is Rewind offering now. The deciding is in domain/rewind/rewindTiming.ts.

// Your Rewind time: the setting, or what the last 14 days of the activity log
// say ("auto"). Evening when there isn't enough to go on.
export async function getRewindWindow(now: Date = new Date()): Promise<RewindWindow> {
  const setting = getRewindTime();
  if (setting !== "auto") return setting;
  const times = await getPracticeTimesSince(dateOffset(now, -(HABIT_DAYS - 1))).catch(() => []);
  return resolveRewindWindow(setting, times, now);
}

// The day Rewind offers right now (null: none), from your Rewind time and the
// days already told.
export async function getRewindOffer(now: Date = new Date()): Promise<RewindOffer | null> {
  const [window, told] = await Promise.all([getRewindWindow(now), getRewindDates().catch(() => [] as string[])]);
  return decideRewindOffer({ now, window, toldDates: told });
}
