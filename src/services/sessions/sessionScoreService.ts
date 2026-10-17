import { getArtifact, putArtifact } from "../db/artifactsRepo";
import { defaultsFromProfile } from "../../domain/profile";
import { getScoreVersion, getUserProfile, setScoreVersion } from "../prefs/prefsStore";
import { getDatabase } from "../db/database";
import { getSessionById } from "../db/sessionsRepo";
import { getScoresBySessionId } from "../db/scoresRepo";
import { computeSessionScore, SCORE_BREAKDOWN_VERSION, type CloudSource, type SessionScoreBreakdown } from "../../domain/sessionScore";
import { PROVIDERS } from "../cloud/providers";
import type { CloudTranscriptArtifact } from "../pipeline/steps/cloudReviewStep";
import type { CoachOutput } from "../../domain/coach/ruleCoach";
import type { PauseAnalysis } from "../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../domain/presenceMetrics";
import type { Session } from "../../domain/sessionTypes";
import { logger } from "../../utils/logger";

// Words per minute and pitch range as measured on the phone — shared with
// the coach step so both see the same numbers.
export function measuredVoice(session: Session): { wpmAvg: number | null; pitchRangeHz: number | null } {
  const words = session.transcriptWords;
  return {
    wpmAvg:
      words && words.length > 0 && session.durationSeconds > 0
        ? Math.round(words.length / (Math.max(session.durationSeconds, 1) / 60))
        : null,
    pitchRangeHz:
      session.pitchMaxHz != null && session.pitchMinHz != null ? Math.round(session.pitchMaxHz - session.pitchMinHz) : null,
  };
}

// What the deep review saw. Reviews from before the provider was recorded
// were all Gemini, which watches the video.
export function cloudSourceOf(artifact: CloudTranscriptArtifact | null): CloudSource {
  return PROVIDERS[artifact?.provider ?? "gemini"].input === "video" ? "video" : "measurements";
}

// Recomputes the combined session score from whatever exists now. Called
// after on-device coaching and after a cloud review, so the score fills in
// and then sharpens. Never throws — a score is a bonus, not a step.
export async function refreshSessionScore(sessionId: string): Promise<SessionScoreBreakdown | null> {
  try {
    const session = await getSessionById(sessionId);
    // Feeling reps are process only — no score, ever.
    if (!session || session.sessionType === "feeling") return null;
    const stutterMode = defaultsFromProfile(getUserProfile()).stutterMode;
    const [pauses, presence, coach, cloud, cloudTranscript] = await Promise.all([
      getArtifact<PauseAnalysis>(sessionId, "pauses"),
      getArtifact<PresenceMetrics>(sessionId, "presence"),
      getArtifact<CoachOutput>(sessionId, "coach"),
      getScoresBySessionId(sessionId),
      getArtifact<CloudTranscriptArtifact>(sessionId, "cloud_transcript"),
    ]);
    const breakdown = computeSessionScore(
      {
        durationSeconds: session.durationSeconds,
        ...measuredVoice(session),
        // Stuttering: fluency isn't measured against you.
        fillerRatePerMinute: stutterMode ? null : session.fillerRatePerMinute,
        pauses: stutterMode && pauses ? { ...pauses, hesitations: 0, midPhrasePauses: 0 } : pauses,
        presence,
        coach,
        targetFramework: session.subjectExtras?.targetFramework ?? null,
      },
      cloud,
      cloudSourceOf(cloudTranscript),
    );
    if (!breakdown) return null;
    await putArtifact(sessionId, "session_score", breakdown);
    const db = await getDatabase();
    await db.runAsync(`UPDATE sessions SET session_score = ? WHERE id = ?`, [breakdown.overall, sessionId]);
    logger.info(`[score] ${sessionId}: ${breakdown.overall}/10 from ${breakdown.sources.join(" + ")}`);
    return breakdown;
  } catch (error) {
    logger.error(`[score] ${sessionId} failed — ${(error as Error).message}`);
    return null;
  }
}

// Catch-up on launch: sessions analyzed before the combined score existed,
// and — once, after the scoring rules change — every scored session, so
// old and new takes are compared on the same rules. Cheap once caught up.
export async function backfillSessionScores(limit = 200): Promise<void> {
  const db = await getDatabase();
  const rescore = getScoreVersion() < SCORE_BREAKDOWN_VERSION;
  const rows = await db.getAllAsync<{ id: string }>(
    `SELECT s.id FROM sessions s
     WHERE ${rescore ? "1 = 1" : "s.session_score IS NULL"} AND s.status = 'done' AND s.deleted_at IS NULL
       AND (EXISTS (SELECT 1 FROM session_artifacts a WHERE a.session_id = s.id AND a.kind = 'coach')
            OR EXISTS (SELECT 1 FROM scores sc WHERE sc.session_id = s.id))
     ORDER BY s.recorded_at DESC LIMIT ?`,
    [rescore ? 5000 : limit],
  );
  for (const row of rows) await refreshSessionScore(row.id);
  if (rescore) setScoreVersion(SCORE_BREAKDOWN_VERSION);
  if (rows.length) logger.info(`[score] ${rescore ? "rescored" : "backfilled"} ${rows.length} session score(s)`);
}
