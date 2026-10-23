import { File } from "expo-file-system";
import { decodeVideoAudio } from "../../domain/audioAnalysis";
import { encodeWavPcm16 } from "../../domain/eval/wer";
import { concatWaveforms, WAV_SAMPLE_RATE } from "../../domain/rewind/wav";
import { rewindStats } from "../../domain/rewind/stats";
import { cleanTranscript } from "../../domain/cleanTranscript";
import { transcribeOnDevice, type OnDeviceTranscriptWord } from "../onDeviceAsr/onDeviceAsrClient";
import type { TranscriptWord } from "../../domain/sessionTypes";
import { runHeavy } from "../pipeline/jobQueue";
import { createRewind, getRewind, updateRewind } from "../db/rewindRepo";
import { resolveRewindUri, rewindAudioExists, writeRewindAudio } from "./rewindStorage";
import { reviewOnDevice } from "./rewindReview";
import { syncRewindReminder } from "./rewindReminder";
import { logger } from "../../utils/logger";
import type { RewindTake } from "../../hooks/useRewindRecorder";

// What happens to a Rewind take once you've told your day: the pieces of
// audio are joined into one file, Whisper writes the transcript, the counts
// are worked out, and — where the phone has an on-device model — the coach
// writes its notes. The row is saved first and filled in as each step
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
    if (!rewind.review) {
      const review = await reviewOnDevice(transcript);
      if (review) await updateRewind(id, { review, reviewSource: "apple" });
    }
    return true;
  } catch (error) {
    logger.warn(`[rewind] transcribing again failed — ${(error as Error).message}`);
    return false;
  }
}

export async function processRewind(take: RewindTake): Promise<string> {
  const rewind = await createRewind(take.durationMs / 1000);
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
      const audioFile = writeRewindAudio(rewind.id, encodeWavPcm16(waveform, WAV_SAMPLE_RATE));
      await updateRewind(rewind.id, { audioFile });

      // 2. Whisper, on the whole take.
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
    }
    // 3. The counts, then the notes.
    await updateRewind(rewind.id, {
      transcript,
      transcriptSource: source,
      words,
      stats: rewindStats({ transcript, seconds, volume: take.volume }),
    });
    const review = await reviewOnDevice(transcript);
    await updateRewind(rewind.id, review ? { review, reviewSource: "apple", status: "done" } : { status: "done" });
  } catch (error) {
    logger.error(`[rewind] processing failed — ${(error as Error).message}`);
    await updateRewind(rewind.id, { transcript, transcriptSource: source, words, stats: rewindStats({ transcript, seconds, volume: take.volume }), status: "failed" }).catch(() => undefined);
  }
  // The recognizer's own audio files were only for this, whether it worked or not.
  discardRewindSegments(take.segments);

  // Tonight's nudge is no longer needed.
  syncRewindReminder({ askIfFirst: true }).catch(() => undefined);
  return rewind.id;
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
