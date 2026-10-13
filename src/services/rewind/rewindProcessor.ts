import { File } from "expo-file-system";
import { decodeVideoAudio } from "../../domain/audioAnalysis";
import { encodeWavPcm16 } from "../../domain/eval/wer";
import { concatWaveforms, WAV_SAMPLE_RATE } from "../../domain/rewind/wav";
import { rewindStats } from "../../domain/rewind/stats";
import { cleanTranscript } from "../../domain/cleanTranscript";
import { transcribeOnDevice } from "../onDeviceAsr/onDeviceAsrClient";
import { runHeavy } from "../pipeline/jobQueue";
import { createRewind, updateRewind } from "../db/rewindRepo";
import { writeRewindAudio } from "./rewindStorage";
import { reviewOnDevice } from "./rewindReview";
import { syncRewindReminder } from "./rewindReminder";
import { logger } from "../../utils/logger";
import type { RewindTake } from "../../hooks/useRewindRecorder";

// What happens to a Rewind take once you've told your day: the pieces of
// audio are joined into one file, Whisper writes the transcript, the counts
// are worked out, and — where the phone has an on-device model — the coach
// writes its notes. The row is saved first and filled in as each step
// finishes, so a failure partway never loses the take.

export async function processRewind(take: RewindTake): Promise<string> {
  const rewind = await createRewind(take.durationMs / 1000);
  const seconds = take.durationMs / 1000;
  let transcript = take.liveText;
  let source: "whisper" | "live" = "live";

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
        }
      } catch (error) {
        logger.warn(`[rewind] Whisper didn't finish, using what the recognizer heard — ${(error as Error).message}`);
      }
    }
    // The recognizer's own audio files were only for this.
    for (const uri of take.segments) {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        // Left for the temp-file cleanup.
      }
    }

    // 3. The counts, then the notes.
    await updateRewind(rewind.id, {
      transcript,
      transcriptSource: source,
      stats: rewindStats({ transcript, seconds, volume: take.volume }),
    });
    const review = await reviewOnDevice(transcript);
    await updateRewind(rewind.id, review ? { review, reviewSource: "apple", status: "done" } : { status: "done" });
  } catch (error) {
    logger.error(`[rewind] processing failed — ${(error as Error).message}`);
    await updateRewind(rewind.id, { transcript, transcriptSource: source, stats: rewindStats({ transcript, seconds, volume: take.volume }), status: "failed" }).catch(() => undefined);
  }

  // Tonight's nudge is no longer needed.
  syncRewindReminder({ askIfFirst: true }).catch(() => undefined);
  return rewind.id;
}
