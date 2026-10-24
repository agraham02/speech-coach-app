import { File } from "expo-file-system";
import { decodeVideoAudio } from "../../domain/audioAnalysis";
import { encodeWavPcm16 } from "../../domain/eval/wer";
import { concatWaveforms, WAV_SAMPLE_RATE } from "../../domain/rewind/wav";
import { rewindStats } from "../../domain/rewind/stats";
import { cleanTranscript } from "../../domain/cleanTranscript";
import { transcribeOnDevice, type OnDeviceTranscriptWord } from "../onDeviceAsr/onDeviceAsrClient";
import type { TranscriptWord } from "../../domain/sessionTypes";
import { runHeavy } from "../pipeline/jobQueue";
import { createRewind, getRewind, listProcessingRewinds, setRewindPending, updateRewind } from "../db/rewindRepo";
import { compressRewindAudio, deleteRewindAudio, resolveRewindUri, rewindAudioExists, writeRewindAudio } from "./rewindStorage";
import { syncRewindReminder } from "./rewindReminder";
import { logger } from "../../utils/logger";
import type { RewindTake } from "../../hooks/useRewindRecorder";

// What happens to a Rewind take once you've told your day: the pieces of
// audio are joined into one file, Whisper writes the transcript, the counts
// are worked out. Notes on the words come from Tono AI, on request. The row is saved first and filled in as each step
// finishes, so a failure partway never loses the take.

// Writes a take's transcript again with Whisper, from its saved audio — for
// a take that fell back to what the recognizer heard (Whisper's model hadn't
// downloaded, or the connection dropped). Keeps the pauses already measured.
export async function retranscribeRewind(id: string): Promise<boolean> {
  const rewind = await getRewind(id);
  if (!rewind?.audioFile || !rewindAudioExists(rewind.audioFile)) return false;
  try {
    const decoded = await runHeavy(() => decodeVideoAudio(resolveRewindUri(rewind.audioFile!)));
    if (!decoded) return false;
    const result = await runHeavy(() => transcribeOnDevice(decoded.waveform));
    const transcript = cleanTranscript(result.text);
    if (!transcript.trim()) return false;
    const fresh = rewindStats({ transcript, seconds: rewind.durationSeconds, volume: [] });
    const stats = { ...fresh, longestPauseSeconds: rewind.stats?.longestPauseSeconds ?? null, longPauses: rewind.stats?.longPauses ?? 0 };
    await updateRewind(id, { transcript, transcriptSource: "whisper", words: timedWords(result.words), stats });
    return true;
  } catch (error) {
    logger.warn(`[rewind] transcribing again failed — ${(error as Error).message}`);
    return false;
  }
}

// Where a Rewind being processed has got to, for its result screen.
export type RewindStage = "audio" | "words" | "counting";

const inFlight = new Set<string>();
const stages = new Map<string, RewindStage>();

export function isRewindProcessing(id: string): boolean {
  return inFlight.has(id);
}

export function getRewindStage(id: string): RewindStage | null {
  return stages.get(id) ?? null;
}

// Saves the take (with what it takes to start it again) and starts processing
// it in the background; returns the id at once. The recording screen used to
// wait here for Whisper, with nothing to do and nothing to see: now the result
// screen opens straight away and fills in (and a take cut off by the app being
// closed is started again at the next launch: resumeRewinds).
export async function startRewind(take: RewindTake): Promise<string> {
  const rewind = await createRewind(take.durationMs / 1000, { segments: take.segments, liveText: take.liveText, volume: take.volume, durationMs: take.durationMs, resumes: 0 });
  run(rewind.id, take);
  return rewind.id;
}

// Rewinds that were mid-way when the app was closed: tried again once or
// twice, then kept with what the recognizer heard (a take that brings the app
// down can't loop).
const MAX_RESUMES = 2;

export async function resumeRewinds(): Promise<void> {
  for (const { id, pending } of await listProcessingRewinds()) {
    if (inFlight.has(id)) continue;
    if (!pending || pending.resumes >= MAX_RESUMES) {
      const transcript = pending?.liveText ?? "";
      const seconds = (pending?.durationMs ?? 0) / 1000;
      await updateRewind(id, { transcript, transcriptSource: "live", stats: rewindStats({ transcript, seconds, volume: pending?.volume ?? [] }), status: "failed" }).catch(() => undefined);
      continue;
    }
    logger.info(`[rewind] ${id}: picking up where it left off`);
    await setRewindPending(id, { ...pending, resumes: pending.resumes + 1 });
    run(id, { segments: pending.segments, liveText: pending.liveText, volume: pending.volume, durationMs: pending.durationMs });
  }
}

function run(id: string, take: RewindTake): void {
  inFlight.add(id);
  stages.set(id, "audio");
  processTake(id, take)
    .catch((error) => logger.error(`[rewind] ${id}: ${(error as Error).message}`))
    .finally(() => {
      inFlight.delete(id);
      stages.delete(id);
    });
}

async function processTake(id: string, take: RewindTake): Promise<void> {
  const seconds = take.durationMs / 1000;
  let transcript = take.liveText;
  let source: "whisper" | "live" = "live";
  let words: TranscriptWord[] | null = null;

  try {
    // 1. One waveform from the recognizer's audio files.
    const parts: Float32Array[] = [];
    for (const uri of take.segments) {
      const decoded = await runHeavy(() => decodeVideoAudio(uri));
      if (decoded) parts.push(decoded.waveform);
    }
    if (parts.length) {
      const waveform = concatWaveforms(parts);
      const audioFile = writeRewindAudio(id, encodeWavPcm16(waveform, WAV_SAMPLE_RATE));
      await updateRewind(id, { audioFile });

      // 2. Whisper, on the whole take.
      stages.set(id, "words");
      try {
        const result = await runHeavy(() => transcribeOnDevice(waveform));
        if (result.text.trim()) {
          transcript = cleanTranscript(result.text);
          source = "whisper";
          words = timedWords(result.words);
        }
      } catch (error) {
        logger.warn(`[rewind] Whisper didn't finish, using what the recognizer heard — ${(error as Error).message}`);
      }
      // Kept as AAC from here on: about an eighth of the WAV's size. Not for
      // a take deleted meanwhile (it's in the undo window: getRewind hides it).
      const compressed = (await getRewind(id)) ? await compressRewindAudio(id, audioFile) : null;
      if (compressed) {
        await updateRewind(id, { audioFile: compressed });
        deleteRewindAudio(audioFile);
        logger.info(`[rewind] audio kept as AAC (${compressed})`);
      } else {
        logger.info("[rewind] audio kept as WAV (the AAC encode failed or wasn't smaller)");
      }
    }
    stages.set(id, "counting");
    // 3. The counts. Notes on the words are asked for from the result
    // screen (services/rewind/rewindReview.ts).
    await updateRewind(id, {
      transcript,
      transcriptSource: source,
      words,
      stats: rewindStats({ transcript, seconds, volume: take.volume }),
      status: "done",
    });
  } catch (error) {
    logger.error(`[rewind] processing failed — ${(error as Error).message}`);
    await updateRewind(id, { transcript, transcriptSource: source, words, stats: rewindStats({ transcript, seconds, volume: take.volume }), status: "failed" }).catch(() => undefined);
  }
  // The recognizer's own audio files were only for this, whether it worked or not.
  discardRewindSegments(take.segments);

  // Tonight's nudge is no longer needed.
  syncRewindReminder({ askIfFirst: true }).catch(() => undefined);
}

// Whisper's words in the millisecond form transcripts are stored in. The
// timings line up with the saved WAV, since Whisper ran on that same audio.
function timedWords(words: OnDeviceTranscriptWord[]): TranscriptWord[] | null {
  if (!words.length) return null;
  return words.map((w) => ({ text: w.text, startMs: Math.round(w.startSeconds * 1000), endMs: Math.round(w.endSeconds * 1000) }));
}

// Deletes the recognizer's WAV segments for a take: after processing, and
// when a take is discarded.
export function discardRewindSegments(segments: string[]): void {
  for (const uri of segments) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Left for the launch sweep of the cache.
    }
  }
}
