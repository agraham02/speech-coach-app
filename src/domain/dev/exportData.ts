import { countFillers, fillerRetention, matchFillers, wordErrorRate } from "../eval/wer";
import { findTranscriptProblems } from "../asr/transcriptSanity";
import type { Session, SessionScores } from "../sessionTypes";
import type { StepState } from "../sessionSteps";
import { summarizeHistory, type AsrRunRecord } from "./asrHistory";
import type { MetricRun } from "./metrics";

// Builders for the Dev tab's JSON exports: everything needed to look at a
// take's analysis, or an ASR Lab run, away from the phone. Pure: the screens
// gather the data and hand it over.

const round = (n: number, digits = 1) => Number(n.toFixed(digits));
const roundAll = (values: (number | null)[], digits: number) => values.map((v) => (v === null ? null : round(v, digits)));

export interface ExportContext {
  exportedAt: string;
  app: { version: string; build: string; os: string };
}

export interface TakeExportInput {
  context: ExportContext;
  session: Session;
  steps: StepState[];
  scores: SessionScores | null;
  // Stored results by kind (pauses, presence, coach, session_score, ...).
  artifacts: Record<string, unknown>;
  // The raw face timeline is large: its size is noted, not included.
  presenceSamples: number | null;
}

export function buildTakeExport({ context, session, steps, scores, artifacts, presenceSamples }: TakeExportInput) {
  const words = session.transcriptWords;
  return {
    kind: "tono-take-export",
    version: 1,
    exportedAt: context.exportedAt,
    app: context.app,
    take: {
      id: session.id,
      recordedAt: session.recordedAt,
      type: session.sessionType,
      durationSeconds: session.durationSeconds,
      status: session.status,
      wantsDeepReview: session.wantsGrading,
      videoDeleted: !!session.videoDeletedAt,
      sessionScore: session.sessionScore ?? null,
    },
    transcript: {
      source: session.transcriptionSource,
      verbatim: session.transcriptVerbatim,
      clean: session.transcriptClean,
      wordCount: session.transcriptVerbatim ? session.transcriptVerbatim.split(/\s+/).filter(Boolean).length : 0,
      // [word, startMs, endMs]
      timedWords: words ? words.map((w) => [w.text, w.startMs, w.endMs]) : null,
    },
    fluency: {
      fillerWordCount: session.fillerWordCount,
      fillerRatePerMinute: session.fillerRatePerMinute,
      repeatedWordCount: session.repeatedWordCount,
      // [bucketStartSeconds, wpm]
      wpmCurve: session.wpmCurve ? session.wpmCurve.map((p) => [p.bucketStartSeconds, p.wpm]) : null,
    },
    voice: {
      dspStatus: session.dspStatus,
      pitchHz: { avg: session.pitchAvgHz, min: session.pitchMinHz, max: session.pitchMaxHz },
      volumeDbfs: { avg: session.volumeAvgDbfs, stddev: session.volumeStddevDbfs },
      // One value per 200 ms bucket.
      bucketMs: 200,
      pitchContourHz: session.pitchContourHz ? roundAll(session.pitchContourHz, 0) : null,
      volumeEnvelopeDbfs: session.volumeEnvelopeDbfs ? roundAll(session.volumeEnvelopeDbfs, 1) : null,
    },
    pauses: artifacts.pauses ?? null,
    presence: artifacts.presence ?? null,
    presenceTimeline: presenceSamples != null ? { omitted: true, samples: presenceSamples } : null,
    scoreBreakdown: artifacts.session_score ?? null,
    review: scores,
    coach: artifacts.coach ?? null,
    cloudTranscript: artifacts.cloud_transcript ?? null,
    // Tokens each deep review used, as the provider reported them.
    cloudUsage: artifacts.cloud_usage ?? null,
    steps: steps.map((s) => ({ step: s.step, status: s.status, attempts: s.attempts, lastError: s.lastError, updatedAt: s.updatedAt })),
  };
}

export interface AsrEngineRunInput {
  id: string;
  label: string;
  model?: string;
  status: "running" | "done" | "error";
  text?: string;
  ms?: number;
  words?: { text: string; startMs: number; endMs: number }[];
  error?: string;
  // Memory, CPU and thermal while it ran (see domain/dev/metrics.ts).
  device?: MetricRun | null;
}

// The take's stored deep-review transcript, scored like an engine.
export interface StoredReviewTranscript {
  provider: string | null;
  model: string | null;
  // False for reviews made while Gemini was handed the phone's transcript
  // (it copied it); true once it transcribes the audio itself.
  heardAudio: boolean;
  text: string;
}

export interface AsrExportInput {
  context: ExportContext;
  take: { sessionId: string; recordedAt: string; audioSeconds: number } | null;
  reference: string;
  runs: AsrEngineRunInput[];
  deepReview?: StoredReviewTranscript | null;
  history: AsrRunRecord[];
  models: { id: string; label: string; bytes: number; license: string; downloaded: boolean }[];
}

export function buildAsrExport({ context, take, reference, runs, deepReview, history, models }: AsrExportInput) {
  const typed = reference.trim();
  const audioSeconds = take?.audioSeconds ?? 0;
  const scores = (text: string) => ({
    wordCount: text.split(/\s+/).filter(Boolean).length,
    fillerCount: countFillers(text),
    // Against the typed reference; null when none was typed.
    wer: typed ? round(wordErrorRate(typed, text), 3) : null,
    fillerRetention: typed ? fillerRetention(typed, text) : null,
    inventedFillers: typed ? matchFillers(typed, text).invented : null,
  });
  return {
    kind: "tono-asr-lab-export",
    version: 1,
    exportedAt: context.exportedAt,
    app: context.app,
    take,
    reference: {
      text: typed || null,
      wordCount: typed ? typed.split(/\s+/).filter(Boolean).length : 0,
      fillerCount: typed ? countFillers(typed) : 0,
    },
    results: runs.map((run) => {
      const done = run.status === "done" && run.text != null;
      const text = run.text ?? "";
      return {
        engine: run.id,
        label: run.label,
        model: run.model ?? null,
        status: run.status,
        error: run.error ?? null,
        ms: run.ms ?? null,
        // Processing time over audio length: under 1 is faster than real time.
        realtimeFactor: done && run.ms != null && take && take.audioSeconds > 0 ? round(run.ms / 1000 / take.audioSeconds, 2) : null,
        ...(done ? scores(text) : { wordCount: null, fillerCount: null, wer: null, fillerRetention: null, inventedFillers: null }),
        // Signs the engine did not hear the speech (noise tags, loops, words
        // past the end of the audio).
        problems: done ? findTranscriptProblems({ text, words: run.words, audioSeconds }).map((p) => p.detail) : [],
        text: done ? text : null,
        // [word, startMs, endMs]
        timedWords: run.words ? run.words.map((w) => [w.text, w.startMs, w.endMs]) : null,
        device:
          run.device && run.device.measured
            ? {
                peakMemoryBytes: run.device.peakMemoryBytes ?? null,
                memoryGrowthBytes: run.device.peakMemoryBytes != null && run.device.startMemoryBytes != null ? run.device.peakMemoryBytes - run.device.startMemoryBytes : null,
                avgCpuPercent: run.device.avgCpuPercent != null ? round(run.device.avgCpuPercent, 1) : null,
                peakCpuPercent: run.device.peakCpuPercent != null ? round(run.device.peakCpuPercent, 1) : null,
                cpuCores: run.device.cpuCores ?? null,
                worstThermalState: run.device.worstThermalState ?? null,
              }
            : null,
      };
    }),
    deepReviewTranscript: deepReview ? { provider: deepReview.provider, model: deepReview.model, heardAudio: deepReview.heardAudio, ...scores(deepReview.text), text: deepReview.text } : null,
    acrossTakes: summarizeHistory(history).map((s) => ({
      engine: s.engineId,
      takes: s.takes,
      avgWer: round(s.avgWer, 3),
      avgFillerRetention: s.avgFillerRetention === null ? null : round(s.avgFillerRetention, 2),
      avgRealtimeFactor: s.avgRealtimeFactor === null ? null : round(s.avgRealtimeFactor, 2),
    })),
    history,
    models,
  };
}
