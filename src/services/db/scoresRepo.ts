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
  };
}

export async function upsertScores(scores: SessionScores): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO scores
      (session_id, structure_score, structure_used, structure_notes,
       rate_score, rate_wpm_avg, rate_notes, volume_score, volume_notes,
       pitch_melody_score, pitch_melody_notes, tonality_score, tonality_notes,
       pausing_score, pausing_notes, eye_contact_score, facial_expressiveness_score,
       body_language_notes, face_voice_congruence_score, archetype_detected,
       archetype_fit_for_topic, overall_score, coaching_summary, top_strength,
       top_focus_area, recommended_drill)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       structure_score = excluded.structure_score,
       structure_used = excluded.structure_used,
       structure_notes = excluded.structure_notes,
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
       recommended_drill = excluded.recommended_drill`,
    [
      scores.sessionId,
      scores.structureScore,
      scores.structureUsed,
      scores.structureNotes,
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
    ],
  );
}

export async function getScoresBySessionId(sessionId: string): Promise<SessionScores | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ScoreRow>(`SELECT * FROM scores WHERE session_id = ?`, [sessionId]);
  return row ? rowToScores(row) : null;
}
