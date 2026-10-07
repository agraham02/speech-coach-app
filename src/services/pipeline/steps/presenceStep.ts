import { getArtifact, putArtifact } from "../../db/artifactsRepo";
import { computePresenceMetrics, type PresenceSample } from "../../../domain/presenceMetrics";
import { StepError } from "../stepRunner";

// Video analysis, on-device: summarizes the face timeline captured while
// recording (eye contact, expressiveness, framing). Independent of audio.
export async function presenceStep(sessionId: string): Promise<void> {
  const timeline = await getArtifact<PresenceSample[]>(sessionId, "presence_timeline");
  if (!timeline) throw new StepError("No face data was captured for this take.");
  const metrics = computePresenceMetrics(timeline);
  if (!metrics) throw new StepError("Too little face data to analyze.");
  await putArtifact(sessionId, "presence", metrics);
}
