import { appendTodayTranscript } from "../../notion/appendTodayTranscript";
import { getSessionById, markSessionNotionSynced } from "../../db/sessionsRepo";
import { describeSessionSubject } from "../../sessions/sessionSubject";
import { StepError } from "../stepRunner";

// Appends the clean transcript to the Notion journal. Idempotent: an
// already-synced session is never appended twice (the per-step lock in
// stepRunner covers concurrent taps).
export async function notionStep(sessionId: string): Promise<void> {
  const session = await getSessionById(sessionId);
  if (!session) throw new StepError("Session not found.");
  if (session.notionSyncedAt) return;
  if (!session.transcriptClean) throw new StepError("There's no transcript to send yet.");
  const subject = await describeSessionSubject(session);
  await appendTodayTranscript(session.transcriptClean, subject.title);
  await markSessionNotionSynced(sessionId);
}
