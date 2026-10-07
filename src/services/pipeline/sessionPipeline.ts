import * as Haptics from "expo-haptics";
import { insertSession, getSessionById, updateSessionWants } from "../db/sessionsRepo";
import { getSessionSteps, seedSessionSteps, setStepStatus } from "../db/stepsRepo";
import { getScoresBySessionId } from "../db/scoresRepo";
import { getCompletedSessionDates } from "../db/statsRepo";
import { claimRecordingForSession } from "../storage/videoStorage";
import { emitStepEvent } from "./processingEvents";
import { refreshSessionStatus, runStep } from "./stepRunner";
import { transcribeStep } from "./steps/transcribeStep";
import { audioMetricsStep } from "./steps/audioMetricsStep";
import { cloudReviewStep } from "./steps/cloudReviewStep";
import { notionStep } from "./steps/notionStep";
import { clearDecodedAudio } from "./steps/decodedAudioCache";
import { runExclusive } from "./jobQueue";
import { showGlobalToast } from "../../components/common/ToastProvider";
import { notifySessionComplete } from "../notifications/sessionCompleteNotifier";
import { syncDailyReminder } from "../notifications/reminderScheduler";
import { navigationRef } from "../../navigation/navigationRef";
import { computeStreaks, streakMilestoneReached } from "../../domain/streaks";
import { planTextToNullableFields } from "../../domain/planYourPoint";
import { isFreeRecordPrompt } from "../../data/topics";
import type { SessionStep, StepStatus } from "../../domain/sessionSteps";
import type { RecordingSubject, SessionType } from "../../domain/sessionTypes";
import { generateId } from "../../utils/generateId";
import { logger } from "../../utils/logger";

// Orchestrates a session's analysis steps (see domain/sessionSteps.ts).
// Replaces the old all-or-nothing processSession: every step persists its
// own state, can be retried or added later on its own, and survives the app
// being killed (reconcile.ts resumes it on the next launch).

const STEP_RUNNERS: Record<SessionStep, ((sessionId: string) => Promise<void>) | null> = {
  transcribe: transcribeStep,
  audio_metrics: audioMetricsStep,
  presence: null, // Phase 2
  coach: null, // Phase 2
  cloud_review: cloudReviewStep,
  notion: notionStep,
};

// Order matters: voice analysis uses the transcript; Notion needs a
// transcript, which a deep review can supply when on-device transcription
// failed.
const STEP_ORDER: SessionStep[] = ["transcribe", "audio_metrics", "presence", "coach", "cloud_review", "notion"];

function subjectToSessionType(subject: RecordingSubject): SessionType {
  if (subject.kind === "script") return "script_practice";
  if (subject.conciseSeconds) return "concise";
  return isFreeRecordPrompt(subject.prompt.id) ? "free_record" : "spontaneous";
}

export interface NewTake {
  subject: RecordingSubject;
  previewUri: string;
  durationSecondsLocal: number;
  wantsCloudReview: boolean;
  wantsNotionSync: boolean;
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
    notionSyncedAt: null,
    wantsGrading: take.wantsCloudReview,
    wantsNotionSync: take.wantsNotionSync,
    sessionType: subjectToSessionType(subject),
    scriptId: subject.kind === "script" ? subject.script.id : null,
    cuesEnabled: subject.kind === "script" ? subject.cuesEnabled : null,
    fillerWordCount: null,
    fillerRatePerMinute: null,
    videoDeletedAt: null,
    deletedAt: null,
    planPointText: planFields.point,
    planReasonText: planFields.reason,
    planExampleText: planFields.example,
    transcriptWords: null,
    wpmCurve: null,
    repeatedWordCount: null,
    assemblyaiTranscriptId: null,
    dspStatus: null,
    pitchContourHz: null,
    volumeEnvelopeDbfs: null,
    pitchAvgHz: null,
    pitchMinHz: null,
    pitchMaxHz: null,
    volumeAvgDbfs: null,
    volumeStddevDbfs: null,
    geminiFileName: null,
    geminiFileUri: null,
    geminiFileUploadedAt: null,
    lastError: null,
    updatedAt: null,
    subjectExtras: subject.kind === "prompt" && subject.conciseSeconds ? { conciseSeconds: subject.conciseSeconds } : null,
    notionBlockId: null,
  });

  const initial: Record<SessionStep, StepStatus> = {
    transcribe: "pending",
    audio_metrics: "pending",
    presence: "skipped",
    coach: "skipped",
    cloud_review: take.wantsCloudReview ? "pending" : "skipped",
    notion: take.wantsNotionSync ? "pending" : "skipped",
  };
  await seedSessionSteps(sessionId, initial);
  logger.info(`[pipeline] ${sessionId}: saved (${subjectToSessionType(subject)}, deep review=${take.wantsCloudReview}, notion=${take.wantsNotionSync})`);

  runPendingSteps(sessionId).catch((error) =>
    logger.error(`[pipeline] ${sessionId}: run failed — ${(error as Error).message}`),
  );
  return sessionId;
}

// Runs every step currently pending or interrupted, in order. Safe to call
// repeatedly — a second call while one is running joins the same run.
export function runPendingSteps(sessionId: string): Promise<void> {
  return runExclusive(`${sessionId}:run`, async () => {
    let ranCloudReview = false;
    for (const step of STEP_ORDER) {
      const runner = STEP_RUNNERS[step];
      if (!runner) continue;
      const state = (await getSessionSteps(sessionId)).find((s) => s.step === step);
      if (!state || (state.status !== "pending" && state.status !== "interrupted")) continue;
      const ok = await runStep(sessionId, step, () => runner(sessionId));
      if (step === "cloud_review" && ok) ranCloudReview = true;
    }
    clearDecodedAudio();
    await refreshSessionStatus(sessionId);
    await announceCompletion(sessionId, ranCloudReview);
  });
}

// Queues one step (again) and runs it — used for "Retry", "Re-run voice
// analysis", "Get deep review" and "Sync to Notion" from the Result screen.
export async function requestStep(sessionId: string, step: SessionStep): Promise<void> {
  if (step === "cloud_review") await updateSessionWants(sessionId, { grading: true });
  if (step === "notion") await updateSessionWants(sessionId, { notion: true });
  await setStepStatus(sessionId, step, "pending");
  emitStepEvent({ sessionId, step, status: "pending" });
  // Re-running the transcript means the voice analysis should follow it.
  if (step === "transcribe") {
    await setStepStatus(sessionId, "audio_metrics", "pending");
    emitStepEvent({ sessionId, step: "audio_metrics", status: "pending" });
  }
  await refreshSessionStatus(sessionId);
  await runPendingSteps(sessionId);
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
  const title = scores ? "Deep review ready" : "Session ready";
  const body = scores ? `Overall ${scores.overallScore}/10 — tap to view.` : "Your analysis is ready — tap to view.";
  notifySessionComplete(sessionId, title, body).catch(() => undefined);
  if (!isViewingSession(sessionId)) {
    showGlobalToast(scores ? `${title} — overall ${scores.overallScore}/10` : title, "success", () => goToResult(sessionId));
  }
  if (scores) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

  const { currentStreak, longestStreak } = computeStreaks(await getCompletedSessionDates());
  const milestone = streakMilestoneReached(currentStreak);
  if (milestone) {
    showGlobalToast(`🏆 ${milestone}-day streak milestone!`, "success");
  } else if (currentStreak >= 2 && currentStreak === longestStreak && !ranCloudReview) {
    showGlobalToast(`🔥 ${currentStreak} day streak!`, "success");
  }
}
