import * as Haptics from "expo-haptics";
import { insertSession, getSessionById, updateSessionWants } from "../db/sessionsRepo";
import { getSessionSteps, seedSessionSteps, setStepStatus } from "../db/stepsRepo";
import { getScoresBySessionId } from "../db/scoresRepo";
import { claimRecordingForSession } from "../storage/videoStorage";
import { emitStepEvent } from "./processingEvents";
import { refreshSessionStatus, runStep } from "./stepRunner";
import { transcribeStep } from "./steps/transcribeStep";
import { audioMetricsStep } from "./steps/audioMetricsStep";
import { cloudReviewStep } from "./steps/cloudReviewStep";
import { presenceStep } from "./steps/presenceStep";
import { coachStep } from "./steps/coachStep";
import { updateTakeSignals } from "../signals/signalsStore";
import { packFaceTrack } from "../../domain/signals/faceTrack";
import { takePresenceTimeline } from "./presenceTimelineStore";
import { clearDecodedAudio } from "./steps/decodedAudioCache";
import { startEarlyUpload } from "./earlyUpload";
import { runExclusive } from "./jobQueue";
import { scheduleShrink } from "../data/videoShrink";
import { beginRun, type RunHandle } from "../dev/deviceMetrics";
import { settleRepProgress } from "../sessions/repProgress";
import { showGlobalToast } from "../../components/common/ToastProvider";
import { notifySessionComplete } from "../notifications/sessionCompleteNotifier";
import { syncDailyReminder } from "../notifications/reminderScheduler";
import { navigationRef } from "../../navigation/navigationRef";
import { streakMilestoneReached } from "../../domain/streaks";
import { sessionReadyText, streakToastText } from "../../domain/notificationCopy";
import { getUserProfile } from "../prefs/prefsStore";
import { getStreakState } from "../db/progressRepo";
import { takeFreezeNotice } from "../streaks/freezeNotice";
import { planTextToNullableFields } from "../../domain/planYourPoint";
import { isFreeRecordPrompt } from "../../data/topics";
import type { SessionStep, StepStatus } from "../../domain/sessionSteps";
import { ADHOC_PROMPT_PREFIX, type RecordingSubject, type SessionSubjectExtras, type SessionType } from "../../domain/sessionTypes";
import { generateId } from "../../utils/generateId";
import { logger } from "../../utils/logger";

// Orchestrates a session's analysis steps (see domain/sessionSteps.ts).
// Replaces the old all-or-nothing processSession: every step persists its
// own state, can be retried or added later on its own, and survives the app
// being killed (reconcile.ts resumes it on the next launch).

const STEP_RUNNERS: Record<SessionStep, ((sessionId: string) => Promise<void>) | null> = {
  transcribe: transcribeStep,
  audio_metrics: audioMetricsStep,
  presence: presenceStep,
  coach: coachStep,
  cloud_review: cloudReviewStep,
};

// Order matters: voice analysis and coaching use the transcript, which a
// deep review can supply when on-device transcription failed.
const STEP_ORDER: SessionStep[] = ["transcribe", "audio_metrics", "presence", "coach", "cloud_review"];

function subjectToSessionType(subject: RecordingSubject): SessionType {
  if (subject.kind === "script") return "script_practice";
  if (subject.feeling) return "feeling";
  if (subject.conciseSeconds) return "concise";
  return isFreeRecordPrompt(subject.prompt.id) ? "free_record" : "spontaneous";
}

function promptExtras(subject: Extract<RecordingSubject, { kind: "prompt" }>): SessionSubjectExtras | null {
  const adhoc = subject.prompt.id.startsWith(ADHOC_PROMPT_PREFIX);
  const extras: SessionSubjectExtras = {
    conciseSeconds: subject.conciseSeconds,
    lessonId: subject.lessonId,
    targetFramework: subject.targetFramework,
    promptText: adhoc ? subject.prompt.text : undefined,
    promptCategory: adhoc ? subject.prompt.category : undefined,
    promptTask: adhoc ? subject.prompt.task : undefined,
    targetSeconds: subject.targetSeconds,
    prepUsed: subject.prepUsed,
    feelingEmotion: subject.feeling?.emotion,
    feelingAngle: subject.feeling?.angle,
  };
  return Object.values(extras).some((v) => v !== undefined) ? extras : null;
}

export interface NewTake {
  subject: RecordingSubject;
  previewUri: string;
  durationSecondsLocal: number;
  wantsCloudReview: boolean;
}

// Saves a kept take: renames the file to <sessionId>.mp4, inserts the row,
// seeds the steps, and starts the on-device analysis in the background.
export async function createSessionFromTake(take: NewTake): Promise<string> {
  const sessionId = generateId();
  const { subject } = take;
  const { fileName, uri } = claimRecordingForSession(take.previewUri, sessionId);
  const planFields = planTextToNullableFields(subject.kind === "prompt" ? subject.planText : undefined);

  await insertSession({
    id: sessionId,
    promptId: subject.kind === "script" ? subject.script.id : subject.prompt.id,
    recordedAt: new Date().toISOString(),
    videoPath: uri,
    videoFile: fileName,
    durationSeconds: take.durationSecondsLocal,
    transcriptionSource: "whisper_ondevice",
    transcriptVerbatim: null,
    transcriptClean: null,
    status: "processing",
    wantsGrading: take.wantsCloudReview,
    sessionType: subjectToSessionType(subject),
    scriptId: subject.kind === "script" ? subject.script.id : null,
    cuesEnabled: subject.kind === "script" ? subject.cuesEnabled : null,
    fillerWordCount: null,
    fillerRatePerMinute: null,
    videoDeletedAt: null,
    planPointText: planFields.point,
    planReasonText: planFields.reason,
    planExampleText: planFields.example,
    transcriptWords: null,
    wpmCurve: null,
    repeatedWordCount: null,
    dspStatus: null,
    pitchContourHz: null,
    volumeEnvelopeDbfs: null,
    pitchMedianHz: null,
    pitchRangeSt: null,
    pitchSdSt: null,
    loudnessSpreadDb: null,
    loudnessPeakSdDb: null,
    geminiFileName: null,
    geminiFileUri: null,
    geminiFileUploadedAt: null,
    lastError: null,
    updatedAt: null,
    subjectExtras: subject.kind === "prompt" ? promptExtras(subject) : null,
  });

  const timeline = takePresenceTimeline(take.previewUri);
  // The face track starts the take's feature track; the audio step adds to it.
  if (timeline) await updateTakeSignals(sessionId, Math.round(take.durationSecondsLocal * 1000), (s) => ({ ...s, face: packFaceTrack(timeline) }));

  const initial: Record<SessionStep, StepStatus> = {
    transcribe: "pending",
    audio_metrics: "pending",
    presence: timeline && timeline.length >= 3 ? "pending" : "skipped",
    coach: "pending",
    cloud_review: take.wantsCloudReview ? "pending" : "skipped",
  };
  await seedSessionSteps(sessionId, initial);
  logger.info(`[pipeline] ${sessionId}: saved (${subjectToSessionType(subject)}, deep review=${take.wantsCloudReview})`);
  // The video upload runs alongside the on-device steps instead of after them.
  if (take.wantsCloudReview) startEarlyUpload(sessionId);

  runPendingSteps(sessionId).catch((error) =>
    logger.error(`[pipeline] ${sessionId}: run failed — ${(error as Error).message}`),
  );
  return sessionId;
}

// Runs every step currently pending or interrupted, in order. Safe to call
// repeatedly — a second call while one is running joins the same run.
// quiet: a background re-measure (services/signals/reextract.ts) — no
// notification, toast or streak message.
export function runPendingSteps(sessionId: string, opts: { quiet?: boolean } = {}): Promise<void> {
  return runExclusive(`${sessionId}:run`, async () => {
    let ranCloudReview = false;
    // Dev builds record the run's peaks for the Metrics screen. Started on
    // the first step, so a launch-time check with nothing to do records nothing.
    let metrics: RunHandle | null = null;
    // A step can queue earlier steps again (a deep review that supplies the
    // missing transcript re-queues voice analysis and coaching), so keep
    // passing until nothing is left — bounded so a bug can't loop forever.
    for (let pass = 0; pass < 3; pass++) {
      let ranAny = false;
      for (const step of STEP_ORDER) {
        const runner = STEP_RUNNERS[step];
        if (!runner) continue;
        const state = (await getSessionSteps(sessionId)).find((s) => s.step === step);
        if (!state || (state.status !== "pending" && state.status !== "interrupted")) continue;
        ranAny = true;
        metrics ??= beginRun("pipeline", "Pipeline run", { sessionId });
        const ok = await runStep(sessionId, step, () => runner(sessionId), metrics.id || undefined);
        if (step === "cloud_review" && ok) ranCloudReview = true;
      }
      if (!ranAny) break;
    }
    metrics?.end();
    clearDecodedAudio();
    await refreshSessionStatus(sessionId);
    await settleRepProgress(sessionId);
    if (!opts.quiet) await announceCompletion(sessionId, ranCloudReview);
    scheduleShrink();
  });
}

// Queues one step (again) and runs it — used for "Retry", "Re-run voice
// analysis" and "Get deep review" from the Result screen.
export async function requestStep(sessionId: string, step: SessionStep, opts: { quiet?: boolean } = {}): Promise<void> {
  if (step === "cloud_review") await updateSessionWants(sessionId, { grading: true });
  await setStepStatus(sessionId, step, "pending");
  emitStepEvent({ sessionId, step, status: "pending" });
  // Downstream steps follow whatever they depend on: voice analysis uses
  // the transcript; coaching uses everything measured.
  const followers: SessionStep[] =
    step === "transcribe" ? ["audio_metrics", "coach"] : step === "audio_metrics" || step === "presence" ? ["coach"] : [];
  for (const follower of followers) {
    await setStepStatus(sessionId, follower, "pending");
    emitStepEvent({ sessionId, step: follower, status: "pending" });
  }
  await refreshSessionStatus(sessionId);
  await runPendingSteps(sessionId, opts);
}

function goToResult(sessionId: string): void {
  if (navigationRef.isReady()) navigationRef.navigate("Result", { sessionId });
}

function isViewingSession(sessionId: string): boolean {
  if (!navigationRef.isReady()) return false;
  const route = navigationRef.getCurrentRoute();
  return route?.name === "Result" && (route.params as { sessionId?: string } | undefined)?.sessionId === sessionId;
}

async function announceCompletion(sessionId: string, ranCloudReview: boolean): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session || session.status !== "done") return;

  syncDailyReminder().catch(() => undefined);
  const scores = ranCloudReview ? await getScoresBySessionId(sessionId) : null;
  const title = scores ? "Judged by Tono AI" : "Session ready";
  // The OS notification is personal; the in-app toast above keeps its short form.
  const ready = sessionReadyText(getUserProfile()?.name, session.sessionType === "feeling" ? "feeling" : scores ? "review" : "take");
  notifySessionComplete(sessionId, ready.title, ready.body).catch(() => undefined);
  if (!isViewingSession(sessionId)) {
    showGlobalToast(scores ? `${title} — overall ${scores.overallScore}/10` : title, "success", () => goToResult(sessionId));
  }
  if (scores) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

  const state = await getStreakState();
  const { currentStreak, longestStreak } = state;
  const milestone = streakMilestoneReached(currentStreak);
  const freezeNotice = takeFreezeNotice(state);
  if (freezeNotice) {
    showGlobalToast(freezeNotice, "success");
  } else if (milestone) {
    showGlobalToast(streakToastText(milestone, "milestone"), "success");
  } else if (currentStreak >= 2 && currentStreak === longestStreak && !ranCloudReview) {
    showGlobalToast(streakToastText(currentStreak, "record"), "success");
  }
}
