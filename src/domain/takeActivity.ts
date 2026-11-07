import { ACTIVITY_IDS } from "../content/activities";
import { isFreeRecordPrompt } from "../data/topics";
import type { RecordingSubject } from "./sessionTypes";

// Which activity a saved take is, for the activity log: a script take, the
// skill check's talk, a Feeling of the week rep, a free record, a Concise
// take, or an impromptu rep (the structure it used is its variant).
export function activityOfTake(subject: RecordingSubject): { activityId: string; variant: string | null } {
  if (subject.kind === "script") return { activityId: ACTIVITY_IDS.script, variant: null };
  if (subject.skillCheck) return { activityId: ACTIVITY_IDS.skillCheck, variant: null };
  if (subject.feeling) return { activityId: ACTIVITY_IDS.feeling, variant: null };
  if (isFreeRecordPrompt(subject.prompt.id)) return { activityId: ACTIVITY_IDS.freeRecord, variant: null };
  if (subject.conciseSeconds != null) return { activityId: ACTIVITY_IDS.concise, variant: null };
  const framework = subject.targetFramework;
  return { activityId: ACTIVITY_IDS.impromptu, variant: framework && framework !== "None" ? framework : null };
}
