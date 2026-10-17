import { getStepsWithStatus } from "../db/stepsRepo";
import { TranscriptionModelMissingError } from "../onDeviceAsr/onDeviceAsrClient";
import { requestStep } from "./sessionPipeline";
import { logger } from "../../utils/logger";

// Takes saved before the transcription model finished downloading failed
// their transcript step with a "download the model" message. When the model
// arrives they are transcribed without anyone having to open each one.
// Voice analysis and coaching follow the transcript on their own.
export async function retryWaitingTakes(): Promise<void> {
  const waiting = (await getStepsWithStatus(["failed"])).filter((s) => s.step === "transcribe" && s.lastError === new TranscriptionModelMissingError().message);
  if (waiting.length === 0) return;
  logger.info(`[pipeline] model ready: transcribing ${waiting.length} waiting take${waiting.length === 1 ? "" : "s"}`);
  // One at a time: each loads the model, and they share the heavy-work queue.
  for (const { sessionId } of waiting) {
    await requestStep(sessionId, "transcribe").catch((error) => logger.error(`[pipeline] ${sessionId}: retry failed — ${(error as Error).message}`));
  }
}
