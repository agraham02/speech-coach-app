import { getSessionById } from "../db/sessionsRepo";
import { getSessionSteps } from "../db/stepsRepo";
import { getScoresBySessionId } from "../db/scoresRepo";
import { getArtifact, type ArtifactKind } from "../db/artifactsRepo";
import { buildTakeExport } from "../../domain/dev/exportData";
import type { PresenceSample } from "../../domain/presenceMetrics";
import { exportContext } from "./devInfo";

const KINDS: ArtifactKind[] = ["pauses", "presence", "coach", "session_score", "cloud_transcript", "cloud_usage"];

// One take with everything its analysis is built from: transcript with word
// timings, filler and pace data, pause analysis, voice curves, the score
// breakdown, the AI review, and the state of each step.
export async function exportTake(sessionId: string) {
  const session = await getSessionById(sessionId);
  if (!session) return null;
  const [steps, scores, timeline] = await Promise.all([
    getSessionSteps(sessionId),
    getScoresBySessionId(sessionId),
    getArtifact<PresenceSample[]>(sessionId, "presence_timeline"),
  ]);
  const artifacts: Record<string, unknown> = {};
  for (const kind of KINDS) artifacts[kind] = await getArtifact<unknown>(sessionId, kind);
  return buildTakeExport({ context: exportContext(), session, steps, scores, artifacts, presenceSamples: timeline ? timeline.length : null });
}
