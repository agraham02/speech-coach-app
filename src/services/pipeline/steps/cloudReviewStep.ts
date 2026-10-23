import { analyzeUploadedVideo, resolveUploadForGrading } from "../../gemini/transcribeSession";
import { todayISODate } from "../../../utils/dateUtils";
import { DAILY_REVIEW_LIMIT, MAX_REVIEW_VIDEO_BYTES, MAX_REVIEW_WORDS, reviewsLeft, wordCount } from "../../cloud/inputGuards";
import { File } from "expo-file-system";
import { getSessionById, updateSessionGeminiFile, updateTranscriptFields } from "../../db/sessionsRepo";
import { analysisToSessionScores, upsertScores } from "../../db/scoresRepo";
import { getArtifact, putArtifact } from "../../db/artifactsRepo";
import { modelFor, reviewBlockedReason, type ProviderId } from "../../cloud/providers";
import { providerFor, whyNoDeepReview } from "../../cloud/routing";
import { measuredReview, measurementLines } from "../../cloud/measuredReview";
import { applyCloudCoach } from "./coachStep";
import { recordCloudUsage } from "../../cloud/usageStore";
import type { TokenUsage } from "../../../domain/cloudUsage";
import type { TextProviderId } from "../../cloud/textProviders";
import type { PauseAnalysis } from "../../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../../domain/presenceMetrics";
import { defaultsFromProfile } from "../../../domain/profile";
import { getCloudCallsToday, getCloudProvider, getUserProfile, noteCloudCall } from "../../prefs/prefsStore";
import { getAccount, refreshAccount } from "../../account/accountStore";
import { setStepStatus } from "../../db/stepsRepo";
import { resolveVideoUri, videoExists } from "../../storage/videoStorage";
import { gradingContextFromSession } from "../../sessions/sessionSubject";
import { emitStepEvent } from "../processingEvents";
import { refreshSessionScore } from "../../sessions/sessionScoreService";
import { earlyUploadSettled } from "../earlyUpload";
import { StepError } from "../stepRunner";

export interface CloudTranscriptArtifact {
  verbatim: string;
  clean: string;
  durationSeconds: number;
  // Which provider and model wrote the review (absent on older takes, which
  // were all Gemini).
  provider?: ProviderId;
  model?: string;
  // True when the model transcribed the audio itself. Gemini reviews made
  // before that copied the phone's transcript, so their "verbatim" text says
  // nothing about what the model heard.
  heardAudio?: boolean;
}

// The "deep review": structure, delivery, presence and coaching scores from
// the bring-your-own-key provider chosen in Settings (services/cloud).
// Gemini watches the video; the others read the on-device transcript and
// measurements. Writes only scores plus its own copy of the transcript (as
// an artifact) — it never touches the on-device results.
export async function cloudReviewStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");
  // Tono AI first, then the person's own key (domain/aiRouting.ts). A review
  // that is already queued was wanted, whatever the "every take" switch says.
  const videoAvailable = !session.videoDeletedAt && videoExists(resolveVideoUri(session));
  let resolved = await providerFor("video_review", { hasVideo: videoAvailable, cloudReviewOn: true });
  if (!resolved && getCloudProvider() === "tono" && getAccount().status === "signedIn" && !getAccount().allowed.review) {
    // The cached "no reviews left" may be old (a new month began): ask once.
    await refreshAccount();
    resolved = await providerFor("video_review", { hasVideo: videoAvailable, cloudReviewOn: true });
  }
  if (!resolved) throw new StepError(videoAvailable ? await whyNoDeepReview() : "The video was deleted, so a deep review isn't possible.");
  const { provider, transport } = resolved;
  const hosted = transport === "hosted";

  const context = await gradingContextFromSession(session);
  if (!context) throw new StepError("Couldn't find this session's prompt or script.");

  // A call to the person's own provider is paid for with their own key, so a
  // stuck retry is capped here. Tono AI's server enforces its own limits.
  const today = todayISODate();
  if (!hosted && reviewsLeft(getCloudCallsToday(today)) === 0) {
    throw new StepError(
      `That's ${DAILY_REVIEW_LIMIT} deep reviews today — the daily limit that keeps a stuck retry from running up your bill. It resets tomorrow.`,
    );
  }

  if (provider.input === "measurements") {
    const blocked = reviewBlockedReason(provider, { hasVideo: true, hasDeviceTranscript: !!session.transcriptVerbatim });
    if (blocked) throw new StepError(`${blocked} Retry the transcript first, or switch to Gemini in Settings to review from the video.`);
    if (wordCount(session.transcriptVerbatim ?? "") > MAX_REVIEW_WORDS) {
      throw new StepError(`This take is too long for a deep review (over ${MAX_REVIEW_WORDS.toLocaleString()} words).`);
    }
    const [pauses, presence] = await Promise.all([
      getArtifact<PauseAnalysis>(sessionId, "pauses"),
      getArtifact<PresenceMetrics>(sessionId, "presence"),
    ]);
    noteCloudCall(today);
    const started = Date.now();
    const seen: { usage?: TokenUsage } = {};
    // Own key only: Tono AI reviews watch the video.
    const analysis = await measuredReview(
      { session, context, pauses, presence, stutterMode: defaultsFromProfile(getUserProfile()).stutterMode },
      provider.id as TextProviderId,
      (usage) => {
        seen.usage = usage;
      },
    );
    // Before the scores land, so the usage is there when the screen updates.
    await recordCloudUsage(sessionId, {
      provider: provider.id,
      model: modelFor(provider.id),
      input: provider.input,
      elapsedMs: Date.now() - started,
      videoBytes: null,
      usage: seen.usage ?? null,
    });
    await upsertScores(analysisToSessionScores(sessionId, analysis));
    await refreshSessionScore(sessionId);
    await putArtifact(sessionId, "cloud_transcript", {
      verbatim: analysis.transcript_verbatim,
      clean: analysis.transcript_clean,
      durationSeconds: analysis.duration_seconds,
      provider: provider.id,
      model: modelFor(provider.id),
    } satisfies CloudTranscriptArtifact);
    return;
  }

  if (session.videoDeletedAt) throw new StepError("The video was deleted, so a deep review isn't possible.");
  const videoUri = resolveVideoUri(session);
  if (!videoExists(videoUri)) throw new StepError("The video file is missing, so a deep review isn't possible.");
  if ((new File(videoUri).size ?? 0) > MAX_REVIEW_VIDEO_BYTES) throw new StepError("This video is too large to send for a deep review.");

  // Gemini is deliberately NOT given the phone's transcript. It used to be,
  // as ground truth, and Gemini then copied it, so a transcript the phone had
  // already stripped of ums came back as the AI's own "verbatim" one. Gemini
  // hears the audio itself: its transcript, fillers included, is independent.

  // An upload started when the take was saved (earlyUpload.ts): wait for it
  // rather than start a second one, then use the file it stored.
  await earlyUploadSettled(sessionId);
  const latest = (await getSessionById(sessionId)) ?? session;
  const existingUpload =
    latest.geminiFileName && latest.geminiFileUri && latest.geminiFileUploadedAt
      ? { name: latest.geminiFileName, uri: latest.geminiFileUri, uploadedAt: latest.geminiFileUploadedAt }
      : null;
  if (!hosted) noteCloudCall(today);
  // A Tono AI review is told what the phone measured, for its notes only: not
  // the transcript or the filler count, which it takes from its own listening.
  const stutterMode = defaultsFromProfile(getUserProfile()).stutterMode;
  let measurements: string[] | undefined;
  if (hosted) {
    const [pauses, presence] = await Promise.all([
      getArtifact<PauseAnalysis>(sessionId, "pauses"),
      getArtifact<PresenceMetrics>(sessionId, "presence"),
    ]);
    measurements = measurementLines({ session: latest, pauses, presence, stutterMode, withFillers: false });
  }
  const { uploaded, reused } = await resolveUploadForGrading(videoUri, existingUpload, undefined, transport);
  if (!reused) {
    await updateSessionGeminiFile(sessionId, { name: uploaded.name, uri: uploaded.uri, uploadedAt: new Date().toISOString() });
  }

  const reviewStarted = Date.now();
  const seenUsage: { usage?: TokenUsage } = {};
  const seenHosted: { model?: string } = {};
  const analysis = await analyzeUploadedVideo(
    uploaded,
    context,
    undefined,
    (usage) => {
      seenUsage.usage = usage;
    },
    hosted
      ? {
          transport,
          videoSeconds: Math.min(300, Math.max(1, Math.ceil(session.durationSeconds || 60))),
          measurements,
          onHosted: (result) => {
            seenHosted.model = result.model;
          },
        }
      : undefined,
  );
  // The model the server actually used (it can change without an app update).
  const modelUsed = seenHosted.model ?? modelFor(provider.id);
  await recordCloudUsage(sessionId, {
    provider: provider.id,
    model: modelUsed,
    input: "video",
    elapsedMs: Date.now() - reviewStarted,
    videoBytes: new File(videoUri).size ?? null,
    usage: seenUsage.usage ?? null,
  });
  await upsertScores(analysisToSessionScores(sessionId, analysis));
  await refreshSessionScore(sessionId);
  await putArtifact(sessionId, "cloud_transcript", {
    verbatim: analysis.transcript_verbatim,
    clean: analysis.transcript_clean,
    durationSeconds: analysis.duration_seconds,
    provider: provider.id,
    model: modelUsed,
    heardAudio: true,
  } satisfies CloudTranscriptArtifact);
  // Tono AI wrote the coach card in the same call: no second request.
  if (hosted) await applyCloudCoach(sessionId, analysis.quick_coach, modelUsed);

  // No device transcript at all (on-device transcription failed): the deep
  // review's transcript becomes the session's transcript.
  if (!session.transcriptVerbatim) {
    await updateTranscriptFields(sessionId, {
      verbatim: analysis.transcript_verbatim,
      clean: analysis.transcript_clean,
      durationSeconds: analysis.duration_seconds,
      source: "gemini",
      words: null,
    });
    await setStepStatus(sessionId, "transcribe", "done");
    emitStepEvent({ sessionId, step: "transcribe", status: "done" });
    // Fillers, pace and coaching can now use this transcript.
    for (const step of ["audio_metrics", "coach"] as const) {
      await setStepStatus(sessionId, step, "pending");
      emitStepEvent({ sessionId, step, status: "pending" });
    }
  }
}
