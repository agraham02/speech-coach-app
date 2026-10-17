import { getArtifact, putArtifact } from "../db/artifactsRepo";
import { getSessionById } from "../db/sessionsRepo";
import { getScoresBySessionId } from "../db/scoresRepo";
import { getSessionSteps } from "../db/stepsRepo";
import { recordRepOutcome } from "../db/progressRepo";
import { showGlobalToast } from "../../components/common/ToastProvider";
import { blendRepEvidence, cloudRepEvidence, localRepEvidence } from "../../domain/repEvidence";
import type { CoachOutput } from "../../domain/coach/ruleCoach";
import type { StepStatus } from "../../domain/sessionSteps";
import type { CloudTranscriptArtifact } from "../pipeline/steps/cloudReviewStep";
import { cloudSourceOf } from "./sessionScoreService";
import { describeSessionSubject } from "./sessionSubject";
import { logger } from "../../utils/logger";

// Moves skill mastery for an impromptu rep — once per session, after its
// analysis has settled. It used to run as soon as the phone's coach
// finished, so a deep review arriving a minute later never counted; now it
// waits for the review (or its failure) and lets it lead. A review asked
// for later, on an old take, doesn't count it again.
//
// `abandoned`: an interrupted step that won't resume on its own (the app
// was closed mid-review long ago) counts as finished, so the rep still
// counts with what's there.
export async function settleRepProgress(sessionId: string, options: { abandoned?: boolean } = {}): Promise<void> {
  const unsettled = (status: StepStatus | undefined) =>
    status === "pending" || status === "running" || (status === "interrupted" && !options.abandoned);
  try {
    const session = await getSessionById(sessionId);
    if (!session || (session.sessionType !== "spontaneous" && session.sessionType !== "concise")) return;
    if (await getArtifact(sessionId, "progress")) return;
    const steps = await getSessionSteps(sessionId);
    const status = (step: string) => steps.find((s) => s.step === step)?.status;
    if (unsettled(status("coach")) || unsettled(status("cloud_review"))) return;

    const [coach, cloud, transcript, subject] = await Promise.all([
      getArtifact<CoachOutput>(sessionId, "coach"),
      getScoresBySessionId(sessionId),
      getArtifact<CloudTranscriptArtifact>(sessionId, "cloud_transcript"),
      describeSessionSubject(session),
    ]);
    if (!coach && !cloud) return;
    const local = coach ? localRepEvidence(coach) : {};
    const reviewed = cloud ? cloudRepEvidence(cloud) : {};
    const changes = await recordRepOutcome(blendRepEvidence(local, reviewed, cloudSourceOf(transcript)), {
      sessionId,
      label: subject.title || "A recorded take",
      local,
      cloud: reviewed,
    });
    await putArtifact(sessionId, "progress", changes);
    if (changes.some((c) => c.leveledUp)) {
      showGlobalToast("Level up — your impromptu reps just got a little harder.", "success");
    }
  } catch (error) {
    logger.error(`[progress] ${sessionId}: couldn't record the rep — ${(error as Error).message}`);
  }
}
