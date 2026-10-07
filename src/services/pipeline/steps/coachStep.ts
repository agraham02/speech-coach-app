import { getSessionById } from "../../db/sessionsRepo";
import { getArtifact, putArtifact } from "../../db/artifactsRepo";
import { describeSessionSubject } from "../../sessions/sessionSubject";
import { ruleCoach, type CoachOutput } from "../../../domain/coach/ruleCoach";
import type { PauseAnalysis } from "../../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../../domain/presenceMetrics";
import type { FrameworkId } from "../../../domain/coach/structureHeuristics";
import { StepError } from "../stepRunner";
import { coachWithOnDeviceModel } from "../../onDeviceLlm/onDeviceCoach";

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

  const words = session.transcriptWords;
  const wpmAvg =
    words && words.length > 0 && session.durationSeconds > 0
      ? Math.round(words.length / (Math.max(session.durationSeconds, 1) / 60))
      : null;
  const pitchRangeHz =
    session.pitchMaxHz != null && session.pitchMinHz != null ? Math.round(session.pitchMaxHz - session.pitchMinHz) : null;

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
}
