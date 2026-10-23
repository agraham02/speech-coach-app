import { getSessionById } from "../../db/sessionsRepo";
import { defaultsFromProfile } from "../../../domain/profile";
import { getUserProfile } from "../../prefs/prefsStore";
import { getArtifact, putArtifact } from "../../db/artifactsRepo";
import { describeSessionSubject } from "../../sessions/sessionSubject";
import { ruleCoach, type CoachOutput } from "../../../domain/coach/ruleCoach";
import { acceptQuickCoach, mergeCloudCoach, type CloudCoaching } from "../../../domain/coach/cloudCoach";
import { logger } from "../../../utils/logger";
import type { PauseAnalysis } from "../../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../../domain/presenceMetrics";
import type { FrameworkId } from "../../../domain/coach/structureHeuristics";
import { StepError } from "../stepRunner";
import { coachWithOnDeviceModel } from "../../onDeviceLlm/onDeviceCoach";
import { measuredVoice, refreshSessionScore } from "../../sessions/sessionScoreService";

// Lays a Tono AI review's own coaching over this take's coach card. The
// phone's coach runs first so the Result screen has something at once; the
// review's version replaces its words when it arrives. A card the review
// didn't write well enough to use leaves the phone's coaching as it was.
export async function applyCloudCoach(sessionId: string, quickCoach: unknown, model?: string): Promise<void> {
  const cloud = acceptQuickCoach(quickCoach, model);
  if (!cloud) {
    logger.warn(`[coach] ${sessionId}: the review's coach card wasn't usable — keeping the phone's`);
    return;
  }
  await putArtifact(sessionId, "cloud_coach", cloud);
  const coach = await getArtifact<CoachOutput>(sessionId, "coach");
  if (coach) await putArtifact(sessionId, "coach", mergeCloudCoach(coach, cloud));
}

// Coaching: measured signals -> one strength, one tip, a focus skill and a
// follow-up question. The phone writes it (the Apple on-device model when
// available, otherwise deterministic rules); a Tono AI review's coaching, when
// the take has one, replaces the words (applyCloudCoach).
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
  // A re-run (after a transcript retry, say) keeps the review's coaching and
  // skips the on-device model it would only replace.
  const cloud = await getArtifact<CloudCoaching>(sessionId, "cloud_coach");
  const output: CoachOutput = cloud ? mergeCloudCoach(rules, cloud) : ((await coachWithOnDeviceModel(input, rules)) ?? rules);
  await putArtifact(sessionId, "coach", output);
  await refreshSessionScore(sessionId);
  // Skill mastery moves once the whole take has settled, deep review
  // included — see services/sessions/repProgress.ts.
}
