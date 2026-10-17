import { getSessionById, updateTranscriptFields } from "../../db/sessionsRepo";
import { TranscriptionModelMissingError, transcribeOnDevice } from "../../onDeviceAsr/onDeviceAsrClient";
import { resolveVideoUri } from "../../storage/videoStorage";
import { cleanTranscript } from "../../../domain/cleanTranscript";
import { describeTranscriptProblems, findTranscriptProblems } from "../../../domain/asr/transcriptSanity";
import { runHeavy } from "../jobQueue";
import { StepError } from "../stepRunner";
import { getDecodedAudio } from "./decodedAudioCache";
import { logger } from "../../../utils/logger";

// On-device transcription (Whisper large-v3-turbo via whisper.rn). Deliberately no silent
// cloud fallback: sending anything off the phone is opt-in only. If this
// fails, the Result screen offers a retry or a deep review, which can
// produce the transcript instead.
export async function transcribeStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");
  const videoUri = resolveVideoUri(session);

  const decoded = await getDecodedAudio(videoUri);
  let missingModel = false;
  const onDevice = decoded
    ? await runHeavy(() => transcribeOnDevice(decoded.waveform)).catch((error) => {
        missingModel = error instanceof TranscriptionModelMissingError;
        logger.error(`[transcribe] on-device ASR failed — ${(error as Error).message}`);
        return null;
      })
    : null;

  if (onDevice && decoded) {
    // Noise tags, loops or words past the end mean the engine did not hear
    // the speech. Only logged for now (Dev, Logs): no false alarm can cost a
    // take its transcript.
    const problems = findTranscriptProblems({
      text: onDevice.text,
      words: onDevice.words.map((w) => ({ text: w.text, startMs: w.startSeconds * 1000, endMs: w.endSeconds * 1000 })),
      audioSeconds: decoded.waveform.length / decoded.sampleRate,
    });
    if (problems.length) logger.warn(`[transcribe] ${sessionId}: ${describeTranscriptProblems(problems)}`);
    await updateTranscriptFields(sessionId, {
      verbatim: onDevice.text,
      clean: cleanTranscript(onDevice.text),
      durationSeconds: onDevice.durationSeconds,
      source: "whisper_ondevice",
      words: onDevice.words.map((w) => ({
        text: w.text,
        startMs: Math.round(w.startSeconds * 1000),
        endMs: Math.round(w.endSeconds * 1000),
      })),
    });
    return;
  }
  // Not a failure to retry blindly: say what to do.
  if (missingModel) throw new StepError(new TranscriptionModelMissingError().message);
  throw new StepError(
    decoded
      ? "On-device transcription didn't finish. Retry, or get a deep review to transcribe in the cloud."
      : "Couldn't read this recording's audio on the device. Retry, or get a deep review to transcribe in the cloud.",
  );
}
