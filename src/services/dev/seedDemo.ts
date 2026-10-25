import { File } from "expo-file-system";
import { SHOW_DEV_TOOLS } from "../../config/devTools";
import { cleanTranscript } from "../../domain/cleanTranscript";
import {
  DEMO_CHAINS,
  DEMO_ID_PREFIX,
  DEMO_REWINDS,
  DEMO_TAKES,
  buildWords,
  demoRewindId,
  demoSessionId,
  rawReview,
  recordedAtFor,
  synthFace,
  synthFeatures,
  verbatimOf,
  type DemoChainSpec,
  type DemoRewindSpec,
  type DemoTakeSpec,
} from "../../domain/dev/demoTakes";
import { acceptJudgedReview } from "../../domain/analysis/judgedReview";
import type { Provenance } from "../../domain/analysis/types";
import { evaluateDrill } from "../../domain/drills/evaluateDrill";
import { DRILL_SKILL } from "../../domain/drills/drillSpecs";
import { prepareDrill } from "../../domain/drills/prepareDrill";
import { checkRewindReview } from "../../domain/rewind/reviewPrompt";
import { rewindStats } from "../../domain/rewind/stats";
import type { Session, SessionSubjectExtras } from "../../domain/sessionTypes";
import { packFaceTrack } from "../../domain/signals/faceTrack";
import { isoDateFromDate } from "../../utils/dateUtils";
import { logger } from "../../utils/logger";
import { envelopeOf, recordAnalysis } from "../analysis/store";
import { getDatabase } from "../db/database";
import { getPracticeMarkerDates } from "../db/practiceDaysRepo";
import { getSessionById, insertSession, updateTranscriptFields } from "../db/sessionsRepo";
import { seedSessionSteps, setStepStatus } from "../db/stepsRepo";
import { deleteTake, finishPendingDeletes } from "../data/takeDeletion";
import { recordAudioAnalysis } from "../pipeline/steps/audioMetricsStep";
import { coachStep } from "../pipeline/steps/coachStep";
import { storeTakeReview } from "../pipeline/steps/cloudReviewStep";
import { presenceStep } from "../pipeline/steps/presenceStep";
import { refreshSessionStatus } from "../pipeline/stepRunner";
import { settleRepProgress } from "../sessions/repProgress";
import { updateTakeSignals } from "../signals/signalsStore";
import { resolveVideoUri } from "../storage/videoStorage";
import type { SessionStep, StepStatus } from "../../domain/sessionSteps";

// Dev, App tools, "Add demo takes". Writes a set of made-up takes the way the
// recording pipeline would have: the session row, the transcript with word
// timings, the feature track (audio and face) from the real summarizers, the
// phone's coaching, the measured score sheet from the real score code, and for
// the "judged" takes a Tono AI review checked by the real schema and stored by
// the real review step. Rewinds and Word Chain / Bridge Chain attempts are
// written to their own tables.
//
// Every demo row has an id that starts with "demo-". "Remove demo takes"
// deletes them through the app's real delete path (so hard delete, the undo
// window logic and the file cleanup are the ones that run) and then the rows
// that have no delete path of their own.
//
// Media: by default a demo take has NO video file. Its row names a file in the
// sessions folder that does not exist, so the Result screen shows "Video
// removed to save space", and the delete alert still offers both choices.
// With the placeholder option a few bytes are written to that file so it
// exists (and the Videos size, free up space and file removal can be checked);
// it is not a playable video, so the player is expected to show an error
// instead of video (verify on the emulator).

export interface SeedOptions {
  // Write a small placeholder file for each take's video.
  placeholderMedia: boolean;
  // Also move the skill ratings, as a real take would when its analysis settles
  // (Skill detail "Recent changes", the progress moment). The ratings are not
  // put back when the demo takes are removed; Reset app does that.
  moveRatings: boolean;
  now?: Date;
}

export interface DemoCounts {
  takes: number;
  rewinds: number;
  drills: number;
}

export interface SeedResult extends DemoCounts {
  skipped: number;
}

function assertDev(): void {
  if (!SHOW_DEV_TOOLS) throw new Error("Demo takes are only available in development and preview builds.");
}

const PLACEHOLDER_BYTES = 2048;

export async function countDemoData(): Promise<DemoCounts> {
  assertDev();
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ takes: number; rewinds: number; drills: number }>(
    `SELECT (SELECT COUNT(*) FROM sessions WHERE id LIKE ?) AS takes,
            (SELECT COUNT(*) FROM day_recalls WHERE id LIKE ? AND deleted_at IS NULL) AS rewinds,
            (SELECT COUNT(*) FROM drill_attempts WHERE id LIKE ?) AS drills`,
    [`${DEMO_ID_PREFIX}%`, `${DEMO_ID_PREFIX}%`, `${DEMO_ID_PREFIX}%`],
  );
  return { takes: row?.takes ?? 0, rewinds: row?.rewinds ?? 0, drills: row?.drills ?? 0 };
}

// --- A take --------------------------------------------------------------------

function sessionRow(spec: DemoTakeSpec, id: string, recordedAt: string, durationSeconds: number): Session {
  const extras: SessionSubjectExtras | null = spec.conciseSeconds ? { conciseSeconds: spec.conciseSeconds, targetSeconds: spec.conciseSeconds } : null;
  return {
    id,
    promptId: spec.promptId,
    recordedAt,
    // The file is named but, unless a placeholder is written, absent.
    videoPath: "",
    videoFile: `${id}.mp4`,
    durationSeconds,
    transcriptionSource: "whisper_ondevice",
    transcriptVerbatim: null,
    transcriptClean: null,
    status: "processing",
    wantsGrading: !!spec.judged,
    sessionType: spec.sessionType,
    scriptId: null,
    cuesEnabled: null,
    fillerWordCount: null,
    fillerRatePerMinute: null,
    videoDeletedAt: null,
    planPointText: null,
    planReasonText: null,
    planExampleText: null,
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
    subjectExtras: extras,
  };
}

function writePlaceholderMedia(session: Session): void {
  try {
    const file = new File(resolveVideoUri(session));
    if (!file.exists) {
      file.create();
      file.write(new Uint8Array(PLACEHOLDER_BYTES));
    }
  } catch (error) {
    logger.warn(`[demo] couldn't write a placeholder file for ${session.id} - ${(error as Error).message}`);
  }
}

export const DEMO_PROVENANCE = (at: string): Provenance => ({
  producer: "tono_ai",
  provider: "Tono AI",
  model: "demo-synthetic",
  promptVersion: "demo",
  judged: true,
  input: "text",
  at,
});

async function seedTake(spec: DemoTakeSpec, options: SeedOptions): Promise<void> {
  const id = demoSessionId(spec.key);
  const now = options.now ?? new Date();
  const recordedAt = recordedAtFor(spec.daysAgo, spec.hour, now);
  const { words, durationMs } = buildWords(spec.speech, spec.seed);
  const verbatim = verbatimOf(words);
  const durationSeconds = durationMs / 1000;

  await insertSession(sessionRow(spec, id, recordedAt, Math.round(durationSeconds)));
  const hasFace = !!spec.face;
  const steps = (status: StepStatus): Record<SessionStep, StepStatus> => ({
    transcribe: status,
    audio_metrics: status,
    presence: hasFace ? status : "skipped",
    coach: status,
    cloud_review: spec.judged ? status : "skipped",
  });
  await seedSessionSteps(id, steps("pending"));

  // Transcript.
  await updateTranscriptFields(id, { verbatim, clean: cleanTranscript(verbatim), durationSeconds, source: "whisper_ondevice", words });
  await setStepStatus(id, "transcribe", "done");

  // Voice analysis, through the step's own recording code.
  const withWords = (await getSessionById(id))!;
  const features = synthFeatures(words, durationMs, spec.voice, spec.seed);
  await recordAudioAnalysis(withWords, { features, thread: "js", elapsedMs: 0 }, true);
  await setStepStatus(id, "audio_metrics", "done");

  // Video analysis from a synthetic face track, through the real step.
  if (spec.face) {
    const timeline = synthFace(durationMs, spec.face, spec.seed);
    await updateTakeSignals(id, durationMs, (s) => ({ ...s, face: packFaceTrack(timeline) }));
    try {
      await presenceStep(id);
      await setStepStatus(id, "presence", "done");
    } catch (error) {
      await setStepStatus(id, "presence", "failed", { lastError: (error as Error).message });
    }
  }

  // The phone's coaching and the measured score sheet.
  await coachStep(id);
  await setStepStatus(id, "coach", "done");

  // The judged layer: a review in the real answer schema, checked and stored
  // like a live one.
  if (spec.judged) {
    const review = acceptJudgedReview(rawReview(spec.judged, cleanTranscript(verbatim)), { kind: "impromptu", transcript: verbatim });
    if (!review) throw new Error(`The demo judgement for "${spec.key}" does not pass the review schema.`);
    const provenance = DEMO_PROVENANCE(now.toISOString());
    const out = {
      review,
      heardAudio: false,
      usage: { inputTokens: 2100, outputTokens: 640, thinkingTokens: 0, totalTokens: 2740 },
      elapsedMs: 4200,
      videoBytes: null,
    };
    await recordAnalysis(id, "take_review", envelopeOf({ status: "done", value: out, provenance }));
    await storeTakeReview((await getSessionById(id))!, out, provenance);
    await setStepStatus(id, "cloud_review", "done");
  }

  await refreshSessionStatus(id);
  if (options.placeholderMedia) writePlaceholderMedia((await getSessionById(id))!);
  if (options.moveRatings) await settleRepProgress(id);
}

// --- A Rewind --------------------------------------------------------------------

async function seedRewind(spec: DemoRewindSpec, options: SeedOptions): Promise<void> {
  const id = demoRewindId(spec.key);
  const now = options.now ?? new Date();
  const recordedAt = recordedAtFor(spec.daysAgo, spec.hour, now);
  const { words } = buildWords(spec.speech, 40 + spec.seconds);
  const transcript = verbatimOf(words);
  const stats = rewindStats({ transcript, seconds: spec.seconds, volume: [] });
  let review = null;
  if (spec.notes) {
    const checked = checkRewindReview(spec.notes, transcript, { final: true });
    if (!checked.ok) throw new Error(`The demo Rewind notes for "${spec.key}" do not pass the check: ${checked.problems.join(" ")}`);
    review = checked.review;
  }
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO day_recalls (id, date, recorded_at, audio_file, duration_seconds, transcript, transcript_source, words_json, stats_json, review_json, review_source, status)
     VALUES (?, ?, ?, NULL, ?, ?, 'whisper', ?, ?, ?, ?, 'done')`,
    [
      id,
      isoDateFromDate(new Date(recordedAt)),
      recordedAt,
      spec.seconds,
      transcript,
      JSON.stringify(words),
      JSON.stringify(stats),
      review ? JSON.stringify(review) : null,
      review ? "Tono AI (demo)" : null,
    ],
  );
}

// --- A drill attempt ------------------------------------------------------------------

async function seedChain(spec: DemoChainSpec, options: SeedOptions): Promise<void> {
  const now = options.now ?? new Date();
  const startedAt = recordedAtFor(spec.daysAgo, spec.hour, now);
  const setup = prepareDrill(spec.drill, spec.level, 1, "pen");
  const evaluated = evaluateDrill(setup, {
    transcript: spec.transcript,
    speakingMs: spec.speakingMs,
    volume: [],
    seedWords: ["pen"],
    chainStarts: [0],
    penalizeResets: true,
  });
  const db = await getDatabase();
  // The same row recordDrillOutcome writes, without moving the skill rating.
  await db.runAsync(
    `INSERT INTO drill_attempts (id, drill_type, content_id, started_at, mode, accuracy_percent, wpm, metrics_json, skill, lesson_id, drill_level, score, success)
     VALUES (?, ?, ?, ?, 'live', ?, ?, ?, ?, NULL, ?, ?, ?)`,
    [
      `${DEMO_ID_PREFIX}drill-${spec.key}`,
      spec.drill,
      setup.contentId,
      startedAt,
      evaluated.details.accuracyPercent ?? null,
      evaluated.details.wpm ?? null,
      JSON.stringify(evaluated.details),
      DRILL_SKILL[spec.drill],
      spec.level,
      evaluated.outcome.score,
      evaluated.outcome.success ? 1 : 0,
    ],
  );
}

// --- Adding and removing -------------------------------------------------------------------

export async function addDemoData(options: SeedOptions): Promise<SeedResult> {
  assertDev();
  const db = await getDatabase();
  const have = new Set((await db.getAllAsync<{ id: string }>(`SELECT id FROM sessions WHERE id LIKE ?`, [`${DEMO_ID_PREFIX}%`])).map((r) => r.id));
  const haveRewinds = new Set((await db.getAllAsync<{ id: string }>(`SELECT id FROM day_recalls WHERE id LIKE ?`, [`${DEMO_ID_PREFIX}%`])).map((r) => r.id));
  const haveDrills = new Set((await db.getAllAsync<{ id: string }>(`SELECT id FROM drill_attempts WHERE id LIKE ?`, [`${DEMO_ID_PREFIX}%`])).map((r) => r.id));
  const result: SeedResult = { takes: 0, rewinds: 0, drills: 0, skipped: 0 };

  // Oldest first, so ratings (when asked to move) build up in time order.
  const takes = [...DEMO_TAKES].sort((a, b) => b.daysAgo - a.daysAgo);
  for (const spec of takes) {
    if (have.has(demoSessionId(spec.key))) {
      result.skipped++;
      continue;
    }
    await seedTake(spec, options);
    result.takes++;
  }
  for (const spec of DEMO_REWINDS) {
    if (haveRewinds.has(demoRewindId(spec.key))) {
      result.skipped++;
      continue;
    }
    await seedRewind(spec, options);
    result.rewinds++;
  }
  for (const spec of DEMO_CHAINS) {
    if (haveDrills.has(`${DEMO_ID_PREFIX}drill-${spec.key}`)) {
      result.skipped++;
      continue;
    }
    await seedChain(spec, options);
    result.drills++;
  }
  logger.info(`[demo] added ${result.takes} take(s), ${result.rewinds} Rewind(s), ${result.drills} drill attempt(s); ${result.skipped} already there`);
  return result;
}

// Removes every demo row. Takes and Rewinds go through deleteTake and the
// real erase (hard delete, the video file, the dev store), which also leaves
// the bare date marker a real delete leaves; those new markers are taken out
// again at the end so the streak shows only real days. Skill ratings that
// moved are not restored.
export async function removeDemoData(): Promise<DemoCounts> {
  assertDev();
  const db = await getDatabase();
  const before = await countDemoData();
  const markersBefore = new Set(await getPracticeMarkerDates());
  const sessions = await db.getAllAsync<{ id: string }>(`SELECT id FROM sessions WHERE id LIKE ?`, [`${DEMO_ID_PREFIX}%`]);
  for (const { id } of sessions) {
    // A take still in its undo window is already hidden; the erase below takes it.
    await deleteTake("session", id);
  }
  const rewinds = await db.getAllAsync<{ id: string }>(`SELECT id FROM day_recalls WHERE id LIKE ? AND deleted_at IS NULL`, [`${DEMO_ID_PREFIX}%`]);
  for (const { id } of rewinds) await deleteTake("rewind", id);
  await finishPendingDeletes();
  await db.runAsync(`DELETE FROM drill_attempts WHERE id LIKE ?`, [`${DEMO_ID_PREFIX}%`]);
  const added = (await getPracticeMarkerDates()).filter((d) => !markersBefore.has(d));
  for (const date of added) await db.runAsync(`DELETE FROM practice_days WHERE date = ?`, [date]);
  logger.info(`[demo] removed ${before.takes} take(s), ${before.rewinds} Rewind(s), ${before.drills} drill attempt(s)`);
  return before;
}
