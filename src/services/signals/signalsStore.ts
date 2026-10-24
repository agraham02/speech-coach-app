import { getArtifact, putArtifact } from "../db/artifactsRepo";
import { isSessionLive } from "../db/sessionsRepo";
import { emptySummary, SIGNALS_SCHEMA, type TakeSignals } from "../../domain/signals/types";
import { unpackFaceTrack } from "../../domain/signals/faceTrack";
import type { PresenceSample } from "../../domain/presenceMetrics";

// The take's feature track (the "signals" artifact). Written in parts by the
// session's steps, which run one at a time per take (runPendingSteps is
// exclusive per session), so read-modify-write is safe here.

export async function getTakeSignals(sessionId: string): Promise<TakeSignals | null> {
  const stored = await getArtifact<TakeSignals>(sessionId, "signals");
  return stored && stored.schema === SIGNALS_SCHEMA ? stored : null;
}

// A take being deleted (in its undo window) gets nothing written for it.
export async function updateTakeSignals(sessionId: string, durationMs: number, change: (current: TakeSignals) => TakeSignals): Promise<TakeSignals | null> {
  if (!(await isSessionLive(sessionId))) return null;
  const current = (await getTakeSignals(sessionId)) ?? { schema: SIGNALS_SCHEMA, durationMs, audio: null, face: null, summary: emptySummary() };
  const next = change(current);
  await putArtifact(sessionId, "signals", next);
  return next;
}

// The face timeline, unpacked from the stored track (null when the take had
// no face data).
export async function getPresenceTimeline(sessionId: string): Promise<PresenceSample[] | null> {
  const signals = await getTakeSignals(sessionId);
  return signals?.face ? unpackFaceTrack(signals.face) : null;
}
