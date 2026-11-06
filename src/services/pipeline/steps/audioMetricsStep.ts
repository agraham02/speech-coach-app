import { getSessionById, isSessionLive, updateAudioMetricFields } from "../../db/sessionsRepo";
import type { Session } from "../../../domain/sessionTypes";
import { resolveVideoUri } from "../../storage/videoStorage";
import { computeFillerStats, detectRepeatedWordsFromText, detectRepeatedWordsFromWords } from "../../../domain/transcriptAnnotations";
import { computeWpmCurve } from "../../../domain/wpmCurve";
import { StepError } from "../stepRunner";
import { putArtifact } from "../../db/artifactsRepo";
import { pausesFromFeatures } from "../../../domain/dsp/pauses";
import {
  audioQualityReasons,
  bucketSeries,
  loudnessStatsOf,
  packAudioFeatures,
  pauseStatsOf,
  pitchRangeScorable,
  pitchStatsOf,
  prosodyStatsOf,
  rateStatsOf,
} from "../../../domain/signals/audioSummary";
import { extractOffThread, type ExtractionRun } from "../../audio/dspRuntime";
import { updateTakeSignals } from "../../signals/signalsStore";
import { getDecodedAudio } from "./decodedAudioCache";
import { logger } from "../../../utils/logger";

// Voice analysis: the feature track (pitch, loudness, voice activity) from
// the audio itself, plus fillers, repeated words and pace from whatever
// transcript exists. Runs after transcription but doesn't require it — the
// DSP half works alone.
export async function audioMetricsStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");

  const decoded = await getDecodedAudio(resolveVideoUri(session));

  if (!decoded && !session.transcriptVerbatim) {
    throw new StepError("Couldn't read this recording's audio, and there's no transcript to analyze yet.");
  }

  let run: ExtractionRun | null = null;
  if (decoded) {
    try {
      run = await extractOffThread(decoded.waveform, decoded.sampleRate);
    } catch (error) {
      logger.error(`[dsp] ${sessionId}: feature extraction failed — ${(error as Error).message}`);
    }
  }
  await recordAudioAnalysis(session, run, !!decoded);
}

// Everything the step stores once the audio has been measured (or could not
// be): the pauses, the feature track and its summaries, and the take's voice
// columns. `run` is null when nothing could be measured; `decoded` says the
// audio itself was readable. Shared with the Dev tab's demo takes
// (services/dev/seedDemo.ts), which hand it synthetic frames.
export async function recordAudioAnalysis(session: Session, run: ExtractionRun | null, decoded: boolean): Promise<void> {
  const sessionId = session.id;
  const words = session.transcriptWords;
  const verbatim = session.transcriptVerbatim;
  const fillers = verbatim ? computeFillerStats(verbatim, session.durationSeconds) : null;
  const repeated = words && words.length > 0 ? detectRepeatedWordsFromWords(words) : verbatim ? detectRepeatedWordsFromText(verbatim) : null;
  // Deleted while it was being measured (in the undo window): record nothing.
  if (!(await isSessionLive(sessionId))) return;
  const features = run?.features ?? null;
  const pauses = features ? pausesFromFeatures(features, words) : null;
  const pitch = features ? pitchStatsOf(features) : null;
  const loudness = features ? loudnessStatsOf(features) : null;
  const series = features ? bucketSeries(features) : null;

  if (pauses) await putArtifact(sessionId, "pauses", pauses);

  await updateTakeSignals(sessionId, Math.round(session.durationSeconds * 1000), (current) => ({
    ...current,
    durationMs: features?.durationMs ?? current.durationMs,
    audio: features && run ? packAudioFeatures(features, { thread: run.thread, elapsedMs: run.elapsedMs }) : current.audio,
    summary: {
      ...current.summary,
      pitch,
      loudness,
      pauses: pauses ? pauseStatsOf(pauses) : null,
      rate: rateStatsOf(words, pauses),
      prosody: features ? prosodyStatsOf(features, words) : null,
      fillers: fillers
        ? {
            hesitation: fillers.hesitation.count,
            contextual: fillers.contextual.count,
            hesitationPerMinute: fillers.hesitation.ratePerMinute,
            contextualPerMinute: fillers.contextual.ratePerMinute,
          }
        : null,
      // Face reasons are added by the presence step.
      lowConfidence: [...current.summary.lowConfidence.filter((r) => r.startsWith("face")), ...(features ? audioQualityReasons(pitch, loudness) : [])],
    },
  }));

  await updateAudioMetricFields(sessionId, {
    dspStatus: features ? "complete" : decoded ? "failed" : null,
    pitchContourHz: series?.pitchContourHz ?? null,
    volumeEnvelopeDbfs: series?.volumeEnvelopeDbfs ?? null,
    pitchMedianHz: pitch?.medianHz ?? null,
    pitchRangeSt: pitchRangeScorable(pitch, loudness) ? pitch!.rangeSemitones : null,
    pitchSdSt: pitch?.sdSemitones ?? null,
    loudnessSpreadDb: loudness?.spreadDb ?? null,
    loudnessPeakSdDb: loudness?.syllablePeakSdDb ?? null,
    wpmCurve: words && words.length > 0 ? computeWpmCurve(words, session.durationSeconds) : null,
    repeatedWordCount: repeated ? repeated.length : null,
    fillerWordCount: fillers?.count ?? null,
    fillerRatePerMinute: fillers?.ratePerMinute ?? null,
  });
}
