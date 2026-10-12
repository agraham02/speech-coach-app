import { getSessionById, updateTranscriptFields } from "../../db/sessionsRepo";
import { transcribeOnDevice } from "../../onDeviceAsr/onDeviceAsrClient";
import { resolveVideoUri } from "../../storage/videoStorage";
import { cleanTranscript } from "../../../domain/cleanTranscript";
import { runHeavy } from "../jobQueue";
import { StepError } from "../stepRunner";
import { getDecodedAudio } from "./decodedAudioCache";
import { logger } from "../../../utils/logger";

// On-device transcription (Whisper via ExecuTorch). Deliberately no silent
// cloud fallback: sending anything off the phone is opt-in only. If this
// fails, the Result screen offers a retry or a deep review, which can
// produce the transcript instead.
export async function transcribeStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");
  const videoUri = resolveVideoUri(session);

  const decoded = await getDecodedAudio(videoUri);
  const onDevice = decoded
    ? await runHeavy(() => transcribeOnDevice(decoded.waveform)).catch((error) => {
        logger.error(`[transcribe] on-device ASR failed — ${(error as Error).message}`);
        return null;
      })
    : null;

  if (onDevice) {
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
  throw new StepError(
    decoded
      ? "On-device transcription didn't finish. Retry, or get a deep review to transcribe in the cloud."
      : "Couldn't read this recording's audio on the device. Retry, or get a deep review to transcribe in the cloud.",
  );
}
