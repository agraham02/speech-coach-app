import { getArtifact, putArtifact } from "../db/artifactsRepo";
import { defaultsFromProfile } from "../../domain/profile";
import { getScoreVersion, getUserProfile, setScoreVersion } from "../prefs/prefsStore";
import { getDatabase } from "../db/database";
import { getSessionById, isSessionLive } from "../db/sessionsRepo";
import { headlineSheet, judgedFromReview, SCORE_SHEET_VERSION, takeScores, type MeasuredFacts, type TakeScores } from "../../domain/scoring/takeScore";
import type { JudgedReview } from "../../domain/analysis/judgedReview";
import type { Provenance } from "../../domain/analysis/types";
import type { CloudTranscriptArtifact } from "../pipeline/steps/cloudReviewStep";
import type { TakeAnalyses } from "../analysis/store";
import type { CoachOutput } from "../../domain/coach/ruleCoach";
import type { PauseAnalysis } from "../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../domain/presenceMetrics";
import type { Session } from "../../domain/sessionTypes";
import { logger } from "../../utils/logger";
import { speakingWpm } from "../../domain/signals/audioSummary";
import { computeFillerStats } from "../../domain/transcriptAnnotations";
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

// Everything the phone measured about a take, flattened for the measured
// score sheet. The phone's own counts only: the measured layer is the same
// formula on the same kind of numbers for every take, whether or not it was
// judged. Session 06's signals fill it: pitch range in semitones (on your
// band), emphasis from syllable peaks, and fillers by kind, counted by the
// phone's detector (domain/fillers.ts) on the phone's own transcript.
export function measuredFacts(
  session: Session,
  parts: { pauses: PauseAnalysis | null; presence: PresenceMetrics | null; coach: CoachOutput | null; stutterMode: boolean; pitchBand?: PitchRangeBand },
): MeasuredFacts {
  const { pauses, presence, coach, stutterMode, pitchBand } = parts;
  const voice = measuredVoice(session);
  const typed = session.transcriptVerbatim ? computeFillerStats(session.transcriptVerbatim, session.durationSeconds) : null;
  return {
    takeKind: session.sessionType === "script_practice" ? "script" : "impromptu",
    durationSeconds: session.durationSeconds,
    wpm: voice.wpmAvg,
    boundaryPauseRate: pauses?.boundaryPauseRate ?? null,
    pitchRangeSemitones: voice.pitchRangeSt,
    pitchBand,
    emphasisPeakSdDb: session.loudnessPeakSdDb,
    // Stuttering: fillers and stalls aren't measured against you.
    fillers: !stutterMode && typed ? { hesitationPerMinute: typed.hesitation.ratePerMinute, contextualPerMinute: typed.contextual.ratePerMinute } : null,
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
    producer: "tono_ai",
    provider: "Tono AI",
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
    // Feeling reps are process only — no score, ever. A take being deleted
    // (hidden during the undo window) gets nothing new written for it.
    if (!session || session.sessionType === "feeling" || !(await isSessionLive(sessionId))) return null;
    const stutterMode = defaultsFromProfile(getUserProfile()).stutterMode;
    const [pauses, presence, coach, review, transcript, analyses] = await Promise.all([
      getArtifact<PauseAnalysis>(sessionId, "pauses"),
      getArtifact<PresenceMetrics>(sessionId, "presence"),
      getArtifact<CoachOutput>(sessionId, "coach"),
      getArtifact<JudgedReview>(sessionId, "judged_review"),
      getArtifact<CloudTranscriptArtifact>(sessionId, "cloud_transcript"),
      getArtifact<TakeAnalyses>(sessionId, "analysis"),
    ]);
    const facts = measuredFacts(session, { pauses, presence, coach, stutterMode, pitchBand: await pitchBandFor(session) });
    const scores = takeScores(facts, review ? judgedFromReview(review, facts.takeKind) : null, review ? judgedBy(analyses, transcript) : undefined);
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
