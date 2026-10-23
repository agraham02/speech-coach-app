import { getArtifact, putArtifact } from "../db/artifactsRepo";
import { defaultsFromProfile } from "../../domain/profile";
import { getScoreVersion, getUserProfile, setScoreVersion } from "../prefs/prefsStore";
import { getDatabase } from "../db/database";
import { getSessionById } from "../db/sessionsRepo";
import { getScoresBySessionId } from "../db/scoresRepo";
import { headlineSheet, judgedFromRubric, SCORE_SHEET_VERSION, takeScores, type MeasuredFacts, type TakeScores } from "../../domain/scoring/takeScore";
import type { Provenance } from "../../domain/analysis/types";
import type { CloudTranscriptArtifact } from "../pipeline/steps/cloudReviewStep";
import type { TakeAnalyses } from "../analysis/store";
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

// Everything the phone measured about a take, flattened for the measured
// score sheet. The phone's own counts only: the measured layer is the same
// formula on the same kind of numbers for every take, whether or not it was
// judged. Session 06's signals (semitones, emphasis, typed fillers) slot in
// here when they land.
export function measuredFacts(
  session: Session,
  parts: { pauses: PauseAnalysis | null; presence: PresenceMetrics | null; coach: CoachOutput | null; stutterMode: boolean },
): MeasuredFacts {
  const { pauses, presence, coach, stutterMode } = parts;
  const voice = measuredVoice(session);
  return {
    takeKind: session.sessionType === "script_practice" ? "script" : "impromptu",
    durationSeconds: session.durationSeconds,
    wpm: voice.wpmAvg,
    boundaryPauseRate: pauses?.boundaryPauseRate ?? null,
    pitchRangeHz: voice.pitchRangeHz,
    // Stuttering: fillers and stalls aren't measured against you.
    fillers: !stutterMode && session.fillerRatePerMinute != null ? { hesitationPerMinute: session.fillerRatePerMinute, contextualPerMinute: null } : null,
    stalls: !stutterMode && pauses ? pauses.hesitations : null,
    structure: coach
      ? { framework: coach.structure.framework, shaped: coach.structure.framework !== "None", targetFramework: session.subjectExtras?.targetFramework ?? null }
      : null,
    hedges: coach ? coach.hedges.length : null,
    strongEnding: coach?.strongEnding ?? null,
    presence:
      presence && presence.samples > 0 && presence.presentPercent >= 40
        ? { eyeContactPercent: presence.eyeContactPercent, eyeContactSource: presence.eyeContactSource, expressiveness: presence.expressiveness }
        : null,
  };
}

// Who judged the take, from the analysis record (or, failing that, from the
// judge's copy of the transcript).
function judgedBy(analyses: TakeAnalyses | null, transcript: CloudTranscriptArtifact | null): Provenance | undefined {
  const stored = analyses?.take_review;
  if (stored?.status === "done" && stored.provenance) return stored.provenance;
  if (!transcript) return undefined;
  return {
    producer: transcript.provider === "tono" ? "tono_ai" : "own_key",
    provider: transcript.provider === "tono" ? "Tono AI" : transcript.provider,
    model: transcript.model,
    promptVersion: "unknown",
    judged: true,
    input: transcript.heardAudio ? "video" : "text",
    at: new Date().toISOString(),
  };
}

// Recomputes a take's two score sheets from whatever exists now. Called
// after the coach step and after a review, so the score fills in and then the
// judged one takes over. Never throws — a score is a bonus, not a step.
export async function refreshSessionScore(sessionId: string): Promise<TakeScores | null> {
  try {
    const session = await getSessionById(sessionId);
    // Feeling reps are process only — no score, ever.
    if (!session || session.sessionType === "feeling") return null;
    const stutterMode = defaultsFromProfile(getUserProfile()).stutterMode;
    const [pauses, presence, coach, review, transcript, analyses] = await Promise.all([
      getArtifact<PauseAnalysis>(sessionId, "pauses"),
      getArtifact<PresenceMetrics>(sessionId, "presence"),
      getArtifact<CoachOutput>(sessionId, "coach"),
      getScoresBySessionId(sessionId),
      getArtifact<CloudTranscriptArtifact>(sessionId, "cloud_transcript"),
      getArtifact<TakeAnalyses>(sessionId, "analysis"),
    ]);
    const facts = measuredFacts(session, { pauses, presence, coach, stutterMode });
    const scores = takeScores(facts, review ? judgedFromRubric(review, facts.takeKind) : null, review ? judgedBy(analyses, transcript) : undefined);
    if (!scores) return null;
    await putArtifact(sessionId, "session_score", scores);
    const db = await getDatabase();
    // The take's score: the judged one whenever it exists.
    const headline = headlineSheet(scores);
    await db.runAsync(`UPDATE sessions SET session_score = ? WHERE id = ?`, [headline.overall, sessionId]);
    logger.info(`[score] ${sessionId}: ${headline.overall}/10 (${scores.headline}${scores.measured ? `; measured ${scores.measured.overall}` : ""})`);
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
