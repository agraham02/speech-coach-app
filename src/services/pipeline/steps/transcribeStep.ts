import { getSessionById, updateTranscriptFields } from "../../db/sessionsRepo";
import { transcribeOnDevice } from "../../onDeviceAsr/onDeviceAsrClient";
import { transcribeWithAssemblyAi } from "../../assemblyai/assemblyAiClient";
import { getAssemblyAiEnabled } from "../../prefs/prefsStore";
import { resolveVideoUri } from "../../storage/videoStorage";
import { cleanTranscript } from "../../../domain/cleanTranscript";
import { runHeavy } from "../jobQueue";
import { StepError } from "../stepRunner";
import { getDecodedAudio } from "./decodedAudioCache";
import { logger } from "../../../utils/logger";

// On-device transcription (Whisper via ExecuTorch), with AssemblyAI as an
// opt-in upgrade. Deliberately no silent cloud fallback: uploading video is
// opt-in only. If this fails, the Result screen offers a retry or a deep
// review, which can produce the transcript instead.
export async function transcribeStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");
  const videoUri = resolveVideoUri(session);

  const decoded = await getDecodedAudio(videoUri);
  const [onDevice, assemblyAi] = await Promise.all([
    decoded
      ? runHeavy(() => transcribeOnDevice(decoded.waveform)).catch((error) => {
          logger.error(`[transcribe] on-device ASR failed — ${(error as Error).message}`);
          return null;
        })
      : Promise.resolve(null),
    getAssemblyAiEnabled()
      ? transcribeWithAssemblyAi(videoUri).catch((error) => {
          logger.error(`[transcribe] AssemblyAI failed — ${(error as Error).message}`);
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (assemblyAi) {
    await updateTranscriptFields(sessionId, {
      verbatim: assemblyAi.text,
      clean: cleanTranscript(assemblyAi.text),
      durationSeconds: assemblyAi.audioDurationSeconds,
      source: "assemblyai",
      words: assemblyAi.words,
      assemblyaiTranscriptId: assemblyAi.id,
    });
    return;
  }
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
      assemblyaiTranscriptId: null,
    });
    return;
  }
  throw new StepError(
    decoded
      ? "On-device transcription didn't finish. Retry, or get a deep review to transcribe in the cloud."
      : "Couldn't read this recording's audio on the device. Retry, or get a deep review to transcribe in the cloud.",
  );
}
