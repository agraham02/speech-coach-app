import { getSessionById } from "../../db/sessionsRepo";
import { defaultsFromProfile } from "../../../domain/profile";
import { getUserProfile } from "../../prefs/prefsStore";
import { getArtifact, putArtifact } from "../../db/artifactsRepo";
import { describeSessionSubject } from "../../sessions/sessionSubject";
import { ruleCoach, type CoachOutput } from "../../../domain/coach/ruleCoach";
import type { PauseAnalysis } from "../../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../../domain/presenceMetrics";
import type { FrameworkId } from "../../../domain/coach/structureHeuristics";
import { StepError } from "../stepRunner";
import { coachWithOnDeviceModel } from "../../onDeviceLlm/onDeviceCoach";
import { measuredVoice, refreshSessionScore } from "../../sessions/sessionScoreService";

// On-device coaching: measured signals -> one strength, one tip, a focus
// skill and a follow-up question. Uses the Apple on-device model when
// available (Phase 2B), otherwise deterministic rules — never the cloud.
export async function coachStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");
  const stutterMode = defaultsFromProfile(getUserProfile()).stutterMode;
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
    // Stuttering: repetitions, blocks and interjections are never coached
    // as fillers or stalls (onboarding question 2.2).
    fillerRatePerMinute: stutterMode ? null : session.fillerRatePerMinute,
    pauses: stutterMode && pauses ? { ...pauses, hesitations: 0, midPhrasePauses: 0 } : pauses,
    presence,
    pitchRangeHz,
    promptText: session.sessionType === "free_record" ? null : subject.title,
    task: session.sessionType === "free_record" ? null : subject.task,
    targetFramework: (session.subjectExtras?.targetFramework as FrameworkId | undefined) ?? null,
  };
  const rules = ruleCoach(input);
  const output: CoachOutput = (await coachWithOnDeviceModel(input, rules)) ?? rules;
  await putArtifact(sessionId, "coach", output);
  await refreshSessionScore(sessionId);
  // Skill mastery moves once the whole take has settled, deep review
  // included — see services/sessions/repProgress.ts.
}
