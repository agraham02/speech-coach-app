import { getDatabase } from "./database";
import { rowToScores, type ScoreRow } from "./mappers";
import type { SessionScores } from "../../domain/sessionTypes";
import type { GeminiSessionAnalysis } from "../gemini/types";

export function analysisToSessionScores(sessionId: string, analysis: GeminiSessionAnalysis): SessionScores {
  return {
    sessionId,
    structureScore: analysis.structure.score,
    structureUsed: analysis.structure.structure_used,
    structureNotes: analysis.structure.notes,
    relevanceScore: analysis.content.relevance_score,
    relevanceNotes: analysis.content.relevance_notes,
    coherenceScore: analysis.content.coherence_score,
    coherenceNotes: analysis.content.coherence_notes,
    rateScore: analysis.delivery.rate.score,
    rateWpmAvg: analysis.delivery.rate.wpm_avg,
    rateNotes: analysis.delivery.rate.notes,
    volumeScore: analysis.delivery.volume.score,
    volumeNotes: analysis.delivery.volume.notes,
    pitchMelodyScore: analysis.delivery.pitch_melody.score,
    pitchMelodyNotes: analysis.delivery.pitch_melody.notes,
    tonalityScore: analysis.delivery.tonality.score,
    tonalityNotes: analysis.delivery.tonality.notes,
    pausingScore: analysis.delivery.pausing.score,
    pausingNotes: analysis.delivery.pausing.notes,
    eyeContactScore: analysis.presence.eye_contact_score,
    facialExpressivenessScore: analysis.presence.facial_expressiveness_score,
    bodyLanguageNotes: analysis.presence.body_language_notes,
    faceVoiceCongruenceScore: analysis.combined.face_voice_congruence_score,
    archetypeDetected: analysis.combined.archetype_detected,
    archetypeFitForTopic: analysis.combined.archetype_fit_for_topic,
    overallScore: analysis.combined.overall_score,
    coachingSummary: analysis.coaching.summary,
    topStrength: analysis.coaching.top_strength,
    topFocusArea: analysis.coaching.top_focus_area,
    recommendedDrill: analysis.coaching.recommended_drill,
    annotations: analysis.annotations,
    cueComplianceScore: analysis.cue_compliance?.score ?? null,
    cueComplianceNotes: analysis.cue_compliance?.notes ?? null,
  };
}

export async function upsertScores(scores: SessionScores): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO scores
      (session_id, structure_score, structure_used, structure_notes,
       content_relevance_score, content_relevance_notes, content_coherence_score, content_coherence_notes,
       rate_score, rate_wpm_avg, rate_notes, volume_score, volume_notes,
       pitch_melody_score, pitch_melody_notes, tonality_score, tonality_notes,
       pausing_score, pausing_notes, eye_contact_score, facial_expressiveness_score,
       body_language_notes, face_voice_congruence_score, archetype_detected,
       archetype_fit_for_topic, overall_score, coaching_summary, top_strength,
       top_focus_area, recommended_drill, annotations_json,
       cue_compliance_score, cue_compliance_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       structure_score = excluded.structure_score,
       structure_used = excluded.structure_used,
       structure_notes = excluded.structure_notes,
       content_relevance_score = excluded.content_relevance_score,
       content_relevance_notes = excluded.content_relevance_notes,
       content_coherence_score = excluded.content_coherence_score,
       content_coherence_notes = excluded.content_coherence_notes,
       rate_score = excluded.rate_score,
       rate_wpm_avg = excluded.rate_wpm_avg,
       rate_notes = excluded.rate_notes,
       volume_score = excluded.volume_score,
       volume_notes = excluded.volume_notes,
       pitch_melody_score = excluded.pitch_melody_score,
       pitch_melody_notes = excluded.pitch_melody_notes,
       tonality_score = excluded.tonality_score,
       tonality_notes = excluded.tonality_notes,
       pausing_score = excluded.pausing_score,
       pausing_notes = excluded.pausing_notes,
       eye_contact_score = excluded.eye_contact_score,
       facial_expressiveness_score = excluded.facial_expressiveness_score,
       body_language_notes = excluded.body_language_notes,
       face_voice_congruence_score = excluded.face_voice_congruence_score,
       archetype_detected = excluded.archetype_detected,
       archetype_fit_for_topic = excluded.archetype_fit_for_topic,
       overall_score = excluded.overall_score,
       coaching_summary = excluded.coaching_summary,
       top_strength = excluded.top_strength,
       top_focus_area = excluded.top_focus_area,
       recommended_drill = excluded.recommended_drill,
       annotations_json = excluded.annotations_json,
       cue_compliance_score = excluded.cue_compliance_score,
       cue_compliance_notes = excluded.cue_compliance_notes`,
    [
      scores.sessionId,
      scores.structureScore,
      scores.structureUsed,
      scores.structureNotes,
      scores.relevanceScore,
      scores.relevanceNotes,
      scores.coherenceScore,
      scores.coherenceNotes,
      scores.rateScore,
      scores.rateWpmAvg,
      scores.rateNotes,
      scores.volumeScore,
      scores.volumeNotes,
      scores.pitchMelodyScore,
      scores.pitchMelodyNotes,
      scores.tonalityScore,
      scores.tonalityNotes,
      scores.pausingScore,
      scores.pausingNotes,
      scores.eyeContactScore,
      scores.facialExpressivenessScore,
      scores.bodyLanguageNotes,
      scores.faceVoiceCongruenceScore,
      scores.archetypeDetected,
      scores.archetypeFitForTopic,
      scores.overallScore,
      scores.coachingSummary,
      scores.topStrength,
      scores.topFocusArea,
      scores.recommendedDrill,
      JSON.stringify(scores.annotations),
      scores.cueComplianceScore,
      scores.cueComplianceNotes,
    ],
  );
}

export async function getScoresBySessionId(sessionId: string): Promise<SessionScores | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ScoreRow>(`SELECT * FROM scores WHERE session_id = ?`, [sessionId]);
  return row ? rowToScores(row) : null;
}

// The score of the most recent *other* scored session before this one, for
// Result screen's "vs your last session" delta — the combined session score,
// or the cloud score for sessions from before it existed. Null if this is
// the first scored session.
export async function getPreviousOverallScore(recordedAt: string): Promise<number | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ overall_score: number }>(
    `SELECT COALESCE(s.session_score, sc.overall_score) AS overall_score
     FROM sessions s LEFT JOIN scores sc ON sc.session_id = s.id
     WHERE s.status = 'done' AND s.deleted_at IS NULL AND s.recorded_at < ?
       AND COALESCE(s.session_score, sc.overall_score) IS NOT NULL
     ORDER BY s.recorded_at DESC LIMIT 1`,
    [recordedAt],
  );
  return row ? row.overall_score : null;
}

// Overall scores of the takes before this one, most recent first, and the
// best of them all — what a take's progress moment measures against.
export async function getScoreHistoryBefore(recordedAt: string, limit = 5): Promise<{ previous: number[]; best: number | null }> {
  const db = await getDatabase();
  const where = `s.status = 'done' AND s.deleted_at IS NULL AND s.recorded_at < ? AND COALESCE(s.session_score, sc.overall_score) IS NOT NULL`;
  const [rows, best] = await Promise.all([
    db.getAllAsync<{ overall_score: number }>(
      `SELECT COALESCE(s.session_score, sc.overall_score) AS overall_score
       FROM sessions s LEFT JOIN scores sc ON sc.session_id = s.id
       WHERE ${where} ORDER BY s.recorded_at DESC LIMIT ?`,
      [recordedAt, limit],
    ),
    db.getFirstAsync<{ best: number | null }>(
      `SELECT MAX(COALESCE(s.session_score, sc.overall_score)) AS best
       FROM sessions s LEFT JOIN scores sc ON sc.session_id = s.id WHERE ${where}`,
      [recordedAt],
    ),
  ]);
  return { previous: rows.map((r) => r.overall_score), best: best?.best ?? null };
}
