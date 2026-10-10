import { getSessionById } from "../../db/sessionsRepo";
import { getArtifact, putArtifact } from "../../db/artifactsRepo";
import { describeSessionSubject } from "../../sessions/sessionSubject";
import { ruleCoach, type CoachOutput } from "../../../domain/coach/ruleCoach";
import type { PauseAnalysis } from "../../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../../domain/presenceMetrics";
import type { FrameworkId } from "../../../domain/coach/structureHeuristics";
import { StepError } from "../stepRunner";
import { recordRepOutcome } from "../../db/progressRepo";
import { showGlobalToast } from "../../../components/common/ToastProvider";
import { coachWithOnDeviceModel } from "../../onDeviceLlm/onDeviceCoach";
import { measuredVoice, refreshSessionScore } from "../../sessions/sessionScoreService";

// On-device coaching: measured signals -> one strength, one tip, a focus
// skill and a follow-up question. Uses the Apple on-device model when
// available (Phase 2B), otherwise deterministic rules — never the cloud.
export async function coachStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");
  const [pauses, presence, subject] = await Promise.all([
    getArtifact<PauseAnalysis>(sessionId, "pauses"),
    getArtifact<PresenceMetrics>(sessionId, "presence"),
    describeSessionSubject(session),
  ]);

  const { wpmAvg, pitchRangeHz } = measuredVoice(session);

  const input = {
    transcript: session.transcriptVerbatim,
    durationSeconds: session.durationSeconds,
    wpmAvg,
    fillerRatePerMinute: session.fillerRatePerMinute,
    pauses,
    presence,
    pitchRangeHz,
    promptText: session.sessionType === "free_record" ? null : subject.title,
    targetFramework: (session.subjectExtras?.targetFramework as FrameworkId | undefined) ?? null,
  };
  const rules = ruleCoach(input);
  const output: CoachOutput = (await coachWithOnDeviceModel(input, rules)) ?? rules;
  await putArtifact(sessionId, "coach", output);
  await refreshSessionScore(sessionId);

  // Impromptu reps move skill mastery — once per session, so re-running the
  // coach can't count the same rep twice.
  const countsTowardProgress = session.sessionType === "spontaneous" || session.sessionType === "concise";
  if (countsTowardProgress && !(await getArtifact(sessionId, "progress"))) {
    const changes = await recordRepOutcome(output);
    await putArtifact(sessionId, "progress", changes);
    if (changes.some((c) => c.leveledUp)) {
      showGlobalToast("Level up — your impromptu reps just got a little harder.", "success");
    }
  }
}
