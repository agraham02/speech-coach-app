import { deleteArtifact, getArtifact, putArtifact } from "../db/artifactsRepo";
import { defaultsFromProfile } from "../../domain/profile";
import { takeGate } from "../../domain/gates";
import { getScoreVersion, getUserProfile, setScoreVersion } from "../prefs/prefsStore";
import { getDatabase } from "../db/database";
import { getSessionById, isSessionLive } from "../db/sessionsRepo";
import { SCORE_SHEET_VERSION, takeScores, type TakeScores } from "../../domain/scoring/takeScore";
import { loadTakeFacts } from "./takeFacts";
import { scoringOptions } from "../scoring/scoringOptions";
import { activeReadingPreview } from "../dev/signalLabStore";
import type { ReadingPreview } from "../../domain/signalLab/readingTrust";
import type { JudgedReview } from "../../domain/analysis/judgedReview";
import type { Provenance } from "../../domain/analysis/types";
import type { CloudTranscriptArtifact } from "../pipeline/steps/cloudReviewStep";
import type { TakeAnalyses } from "../analysis/store";
import type { Session } from "../../domain/sessionTypes";
import { logger } from "../../utils/logger";
import { speakingWpm } from "../../domain/signals/audioSummary";
import { PERSONAL_BASELINE_MAX_TAKES, pitchRangeBand, type PitchRangeBand } from "../../domain/scoring/bands";

// Words per minute (over the speaking span, first word to last) and pitch
// range (p10 to p90 semitones; null when there wasn't enough clear voice to
// measure it) as measured on the phone — shared with the coach step so both
// see the same numbers.
export function measuredVoice(session: Session): { wpmAvg: number | null; pitchRangeSt: number | null } {
  return { wpmAvg: speakingWpm(session.transcriptWords), pitchRangeSt: session.pitchRangeSt };
}

// The pitch-range band for a take: fixed, or your own once 5 or more earlier
// takes have a measured range (domain/scoring/bands.ts). Takes being deleted
// (deleted_at set, in the undo window) don't count.
export async function pitchBandFor(session: Session): Promise<PitchRangeBand> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ pitch_range_st: number }>(
    `SELECT pitch_range_st FROM sessions
     WHERE pitch_range_st IS NOT NULL AND recorded_at < ? AND deleted_at IS NULL AND session_type != 'feeling'
     ORDER BY recorded_at DESC LIMIT ?`,
    [session.recordedAt, PERSONAL_BASELINE_MAX_TAKES],
  );
  return pitchRangeBand(rows.map((r) => r.pitch_range_st));
}

// Who judged the take, from the analysis record (or, failing that, from the
// judge's copy of the transcript).
function judgedBy(analyses: TakeAnalyses | null, transcript: CloudTranscriptArtifact | null): Provenance | undefined {
  const stored = analyses?.take_review;
  if (stored?.status === "done" && stored.provenance) return stored.provenance;
  if (!transcript) return undefined;
  return {
    producer: "tono_ai",
    provider: "Tono AI",
    model: transcript.model,
    promptVersion: "unknown",
    judged: true,
    input: transcript.heardAudio ? "video" : "text",
    at: new Date().toISOString(),
  };
}

// Recomputes a take's score from whatever exists now. Called after the coach step
// and after a review, so the Delivery score fills in and then a judged Overall
// takes over. Readings that aren't proven yet don't count (domain/signalLab/
// readingTrust.ts); `preview` is the Dev switch counting some early, and is empty
// outside dev builds. Never throws: a score is a bonus, not a step.
export async function refreshSessionScore(sessionId: string, preview: ReadingPreview = activeReadingPreview()): Promise<TakeScores | null> {
  try {
    const session = await getSessionById(sessionId);
    // Feeling reps are process only — no score, ever. A take being deleted
    // (hidden during the undo window) gets nothing new written for it.
    if (!session || session.sessionType === "feeling" || !(await isSessionLive(sessionId))) return null;
    const [facts, review, transcript, analyses] = await Promise.all([
      loadTakeFacts(session),
      getArtifact<JudgedReview>(sessionId, "judged_review"),
      getArtifact<CloudTranscriptArtifact>(sessionId, "cloud_transcript"),
      getArtifact<TakeAnalyses>(sessionId, "analysis"),
    ]);
    // No score without proof the task was done (plan 6.4, rule 2).
    const gate = takeGate({ kind: facts.kind, wordCount: facts.wordCount, readAccuracyPercent: facts.readAccuracyPercent, relaxed: defaultsFromProfile(getUserProfile()).relaxAccuracy, judgeSays: facts.notScorable });
    const db = await getDatabase();
    if (!gate.passed) {
      await putArtifact(sessionId, "take_gate", gate);
      await deleteArtifact(sessionId, "session_score");
      await db.runAsync(`UPDATE sessions SET session_score = NULL WHERE id = ?`, [sessionId]);
      logger.info(`[score] ${sessionId}: not scored (${gate.reason})`);
      return null;
    }
    await deleteArtifact(sessionId, "take_gate");
    const scores = takeScores(facts, review ? judgedBy(analyses, transcript) : undefined, { ...scoringOptions(), preview });
    if (!scores) return null;
    await putArtifact(sessionId, "session_score", scores);
    await db.runAsync(`UPDATE sessions SET session_score = ? WHERE id = ?`, [scores.score, sessionId]);
    logger.info(`[score] ${sessionId}: ${scores.score}/100 (${scores.headline}${scores.delivery != null ? `; delivery ${scores.delivery}` : ""})`);
    return scores;
  } catch (error) {
    logger.error(`[score] ${sessionId} failed — ${(error as Error).message}`);
    return null;
  }
}

// Catch-up on launch: sessions analyzed before scores existed, and — once,
// after the scoring rules change — every scored session, so every take is
// scored on the same rules. Cheap once caught up.
export async function backfillSessionScores(limit = 200): Promise<void> {
  const db = await getDatabase();
  const rescore = getScoreVersion() < SCORE_SHEET_VERSION;
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT s.id FROM sessions s
     WHERE ${rescore ? "1 = 1" : "s.session_score IS NULL"} AND s.status = 'done' AND s.deleted_at IS NULL
       AND (EXISTS (SELECT 1 FROM session_artifacts a WHERE a.session_id = s.id AND a.kind = 'coach')
            OR EXISTS (SELECT 1 FROM scores sc WHERE sc.session_id = s.id))
     ORDER BY s.recorded_at DESC LIMIT ?`,
    [rescore ? 5000 : limit],
  );
  for (const row of rows) await refreshSessionScore(row.id);
  if (rescore) setScoreVersion(SCORE_SHEET_VERSION);
  if (rows.length) logger.info(`[score] ${rescore ? "rescored" : "backfilled"} ${rows.length} session score(s)`);
}
