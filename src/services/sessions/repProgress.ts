import { getArtifact } from "../db/artifactsRepo";
import { getSessionById } from "../db/sessionsRepo";
import { getSessionSteps } from "../db/stepsRepo";
import { recordTakeOutcome } from "../db/progressRepo";
import { showGlobalToast } from "../../components/common/ToastProvider";
import { takeEvidence } from "../../domain/scoring/takeEvidence";
import { takeLeafReadings } from "../../domain/scoring/takeLeaves";
import { loadTakeFacts } from "./takeFacts";
import { activityOfSession } from "../../domain/takeActivity";
import { takeDifficultyOf } from "../../domain/difficulty/scale";
import type { StepStatus } from "../../domain/sessionSteps";
import { refreshSessionScore } from "./sessionScoreService";
import { describeSessionSubject } from "./sessionSubject";
import { logger } from "../../utils/logger";
import { RESEARCH_IMPROMPTU_WEIGHT } from "../../domain/prepTimer";
import { feelingWordsUsed } from "../../domain/feelings";
import { saveProgress } from "../progress/progressMoments";
import { emitProgressSettled, isWatchingProgress } from "../progress/progressEvents";
import { stageName } from "../../domain/levels";
import { lessonPosition } from "../../domain/path";
import { getUnit } from "../../content/lessons";
import { SKILL_LABELS } from "../../theme/tokens";
import { navigationRef } from "../../navigation/navigationRef";
import { checkpointLeaf } from "../../domain/checkpoint";
import { settleCheckpoint } from "../checkpoint/checkpointService";

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
    if (!session) return;
    if (await getArtifact(sessionId, "progress")) return;
    const steps = await getSessionSteps(sessionId);
    const status = (step: string) => steps.find((s) => s.step === step)?.status;
    if (unsettled(status("coach")) || unsettled(status("cloud_review"))) return;

    // The take's score as it stands now that everything is in.
    const [scores, subject] = await Promise.all([refreshSessionScore(sessionId), describeSessionSubject(session)]);
    if (!scores && session.sessionType !== "feeling") return;
    // Each leaf the take can show moves by its own number (scoring/takeLeaves.ts).
    const facts = await loadTakeFacts(session);
    const evidence = takeEvidence({
      activityId: activityOfSession(session),
      readings: takeLeafReadings(facts),
      lessonId: session.subjectExtras?.lessonId ?? null,
      checkpointUnitId: session.subjectExtras?.checkpointUnitId ?? null,
      noPrep: !session.subjectExtras?.prepUsed?.seconds,
      hasTopic: !!session.subjectExtras?.promptText,
      // Research makes it a prepared answer, not an impromptu one.
      messageScale: session.subjectExtras?.prepUsed?.researched ? RESEARCH_IMPROMPTU_WEIGHT : 1,
      feelingWords: session.sessionType === "feeling" && session.transcriptVerbatim ? feelingWordsUsed(session.transcriptVerbatim).length : null,
    });
    // The skill check's talk places the skills (seedSkillRatings); it isn't practice.
    const changes = session.subjectExtras?.placement
      ? []
      : await recordTakeOutcome(evidence, {
          sessionId,
          label: subject.title || "A recorded take",
          meanScore: evidence.score ?? null,
          difficulty: takeDifficultyOf({ tier: subject.tier, prepSeconds: session.subjectExtras?.prepUsed?.seconds ?? null, durationSeconds: session.durationSeconds }),
        });
    // A checkpoint: the take's number on the unit's target leaf is the try's score.
    const checkpointUnit = session.subjectExtras?.checkpointUnitId;
    if (checkpointUnit) {
      const leaf = checkpointLeaf(checkpointUnit);
      const reading = leaf ? evidence.leafScores?.[leaf] : undefined;
      settleCheckpoint(checkpointUnit, reading ? Math.round(reading.score * 100) : null);
    }
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
