import { showGlobalToast } from "../common/ToastProvider";
import { trailLine } from "../../domain/scoring/rollup";
import type { ProgressChange } from "../../services/db/progressRepo";

// The trail for an activity with no result screen of its own: it goes back as soon
// as it's saved, so the toast says what the attempt changed (plan 6.3), or why it
// changed nothing (plan 6.4, rule 2).
export function announceTrail(change: Pick<ProgressChange, "trail">, also?: string): void {
  if (change.trail) showGlobalToast(also ? `${trailLine(change.trail)}. ${also}` : trailLine(change.trail), "success");
  else showGlobalToast(NOT_COUNTED, "info");
}

export const NOT_COUNTED = "Counted as practice. This one doesn't move a score yet: nothing can check it for now.";
