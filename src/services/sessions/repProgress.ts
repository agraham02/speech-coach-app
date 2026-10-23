import { getArtifact } from "../db/artifactsRepo";
import { getSessionById } from "../db/sessionsRepo";
import { getSessionSteps } from "../db/stepsRepo";
import { recordRepOutcome } from "../db/progressRepo";
import { showGlobalToast } from "../../components/common/ToastProvider";
import { repEvidence } from "../../domain/repEvidence";
import type { StepStatus } from "../../domain/sessionSteps";
import { refreshSessionScore } from "./sessionScoreService";
import { describeSessionSubject } from "./sessionSubject";
import { logger } from "../../utils/logger";
import { RESEARCH_IMPROMPTU_WEIGHT } from "../../domain/prepTimer";
import { saveProgress } from "../progress/progressMoments";
import { emitProgressSettled, isWatchingProgress } from "../progress/progressEvents";
import { stageName } from "../../domain/levels";
import { lessonPosition } from "../../domain/path";
import { getUnit } from "../../content/lessons";
import { SKILL_LABELS } from "../../theme/tokens";
import { navigationRef } from "../../navigation/navigationRef";

// Moves skill mastery for an impromptu rep — once per session, after its
// analysis has settled. It used to run as soon as the phone's coach
// finished, so a deep review arriving a minute later never counted; now it
// waits for the review (or its failure), and the judged score is the one
// that counts. A review asked
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

    // The take's score sheets as they stand now that everything is in: the
    // judged one leads when there is one (domain/repEvidence.ts).
    const [scores, subject] = await Promise.all([refreshSessionScore(sessionId), describeSessionSubject(session)]);
    if (!scores) return;
    const { evidence, measured, judged } = repEvidence(scores);
    const changes = await recordRepOutcome(evidence, {
      sessionId,
      label: subject.title || "A recorded take",
      local: measured,
      cloud: judged,
      // Research makes it a prepared answer, not an impromptu one.
      impromptuWeight: session.subjectExtras?.prepUsed?.researched ? RESEARCH_IMPROMPTU_WEIGHT : 1,
    });
    // A path lesson's rep says where it leaves you in the unit.
    const position = session.subjectExtras?.lessonId ? lessonPosition(session.subjectExtras.lessonId) : null;
    const unit = position ? getUnit(position.unitId) : undefined;
    const path = position && unit ? { unitTitle: unit.title, lessonIndex: position.index, lessonCount: position.count } : null;
    await saveProgress(sessionId, { changes, settledAt: new Date().toISOString(), seenAt: null, path });
    // The Result screen for this take plays the moment itself; anywhere
    // else, a stage earned is worth a tap-through toast, and Today keeps
    // the rest waiting in its "new progress" card.
    const watched = isWatchingProgress(sessionId);
    emitProgressSettled(sessionId);
    const staged = changes.find((c) => c.stagedUp && c.stageAfter);
    if (!watched && staged) {
      showGlobalToast(`${SKILL_LABELS[staged.skill]} reached ${stageName(staged.stageAfter!)}. Tap to see it.`, "success", () => {
        if (navigationRef.isReady()) navigationRef.navigate("Result", { sessionId });
      });
    }
  } catch (error) {
    logger.error(`[progress] ${sessionId}: couldn't record the rep — ${(error as Error).message}`);
  }
}
