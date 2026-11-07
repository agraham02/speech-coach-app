import { getArtifact } from "../db/artifactsRepo";
import { getDatabase } from "../db/database";
import { getScriptById } from "../db/scriptsRepo";
import { defaultsFromProfile } from "../../domain/profile";
import { phrasePitchBand, PERSONAL_BASELINE_MAX_TAKES, type PitchRangeBand } from "../../domain/scoring/bands";
import { buildTakeFacts } from "../../domain/scoring/takeFacts";
import type { TakeFacts } from "../../domain/scoring/takeLeaves";
import type { LeafId } from "../../domain/scoring/skillTree";
import { unpackAudioTrack } from "../../domain/signals/audioSummary";
import { trimWordsToVoice } from "../../domain/dsp/wordTrim";
import { unpackFaceTrack } from "../../domain/signals/faceTrack";
import type { CoachOutput } from "../../domain/coach/ruleCoach";
import type { JudgedReview } from "../../domain/analysis/judgedReview";
import type { PauseAnalysis } from "../../domain/dsp/pauses";
import type { PresenceMetrics } from "../../domain/presenceMetrics";
import type { Session } from "../../domain/sessionTypes";
import type { SubcategoryId } from "../../domain/scoring/taxonomy";
import { getFaceCalibration, getUserProfile } from "../prefs/prefsStore";
import { getTakeSignals } from "../signals/signalsStore";

// Everything a take left behind, read once and flattened for its leaves
// (domain/scoring/takeFacts.ts).

// The judge still scores on 1-10 by the old names until 3b.2 narrows it to
// Message on 0-5. Only what it owns counts (plan 6.4, rule 4), on the leaf that
// means the same: it stops scoring pace and pitch from numbers it can't hear.
const JUDGED_LEAF: Partial<Record<SubcategoryId, LeafId>> = {
  relevance: "answers_question",
  structure: "has_shape",
  clarity: "ideas_connect",
};

export function judgedLeaves(review: JudgedReview | null): TakeFacts["judged"] {
  if (!review) return undefined;
  const out: NonNullable<TakeFacts["judged"]> = {};
  for (const [sub, leaf] of Object.entries(JUDGED_LEAF) as [SubcategoryId, LeafId][]) {
    const judged = review.subscores[sub];
    if (judged && Number.isFinite(judged.score)) out[leaf] = { score: judged.score * 10, notes: judged.notes || null };
  }
  return Object.keys(out).length ? out : undefined;
}

// A free record with no topic has no question to answer (plan section 7).
function forThisTake(judged: TakeFacts["judged"], session: Session): TakeFacts["judged"] {
  if (!judged || session.sessionType !== "free_record" || session.subjectExtras?.promptText) return judged;
  const { answers_question: _none, ...rest } = judged;
  return Object.keys(rest).length ? rest : undefined;
}

// The within-phrase band for a take: fixed, or your own once 5 or more earlier
// takes have a number. Takes being deleted don't count.
async function phraseBandFor(session: Session): Promise<PitchRangeBand> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ pitch_phrase_sd_st: number }>(
    `SELECT pitch_phrase_sd_st FROM sessions
     WHERE pitch_phrase_sd_st IS NOT NULL AND recorded_at < ? AND deleted_at IS NULL AND session_type != 'feeling'
     ORDER BY recorded_at DESC LIMIT ?`,
    [session.recordedAt, PERSONAL_BASELINE_MAX_TAKES],
  );
  return phrasePitchBand(rows.map((r) => r.pitch_phrase_sd_st));
}

export async function loadTakeFacts(session: Session): Promise<TakeFacts> {
  const [signals, pauses, presence, coach, review, pitchBand] = await Promise.all([
    getTakeSignals(session.id),
    getArtifact<PauseAnalysis>(session.id, "pauses"),
    getArtifact<PresenceMetrics>(session.id, "presence"),
    getArtifact<CoachOutput>(session.id, "coach"),
    getArtifact<JudgedReview>(session.id, "judged_review"),
    phraseBandFor(session),
  ]);
  const features = signals?.audio ? unpackAudioTrack(signals.audio, signals.durationMs) : null;
  const script = session.sessionType === "script_practice" && session.scriptId ? getScriptById(session.scriptId) : undefined;
  return buildTakeFacts({
    kind: session.sessionType === "script_practice" ? "script" : "impromptu",
    durationSeconds: session.durationSeconds,
    transcript: session.transcriptVerbatim,
    words: features ? trimWordsToVoice(session.transcriptWords, features) : session.transcriptWords,
    features,
    timeline: signals?.face ? unpackFaceTrack(signals.face) : null,
    calibration: getFaceCalibration(),
    pauses,
    summary: signals?.summary ?? null,
    presence,
    coach,
    stutterMode: defaultsFromProfile(getUserProfile()).stutterMode,
    repeatedWordCount: session.repeatedWordCount,
    prepSeconds: session.subjectExtras?.prepUsed?.seconds ?? null,
    scriptText: script?.text ?? null,
    pitchBand,
    judged: forThisTake(judgedLeaves(review), session),
  });
}
