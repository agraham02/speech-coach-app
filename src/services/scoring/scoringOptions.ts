import { defaultsFromProfile } from "../../domain/profile";
import type { CountOptions } from "../../domain/scoring/rollup";
import { STUTTER_EXCLUDED } from "../../domain/scoring/skillTree";
import { activeReadingPreview } from "../dev/signalLabStore";
import { getUserProfile } from "../prefs/prefsStore";

// What counts for this person right now: the Dev preview of unproven readings
// (empty outside dev builds), and Fillers and Flow left out for someone who
// stutters (plan 6.2).
export function scoringOptions(): CountOptions {
  return { preview: activeReadingPreview(), excluded: defaultsFromProfile(getUserProfile()).stutterMode ? STUTTER_EXCLUDED : [] };
}
