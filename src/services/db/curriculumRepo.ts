import { getDatabase } from "./database";
import { rowToCurriculumState, type CurriculumStateRow } from "./mappers";
import { getRecentDrillCompletions } from "./drillsRepo";
import {
  computeRichDeliveryScore,
  DEFAULT_CURRICULUM_LEVEL,
  evaluateCurriculum,
  type CurriculumComponent,
  type CurriculumDecision,
  type CurriculumLevel,
  type CurriculumSessionSignal,
} from "../../domain/curriculum";
import {
  getCurriculumAutoLevel,
  getCurriculumOverride,
  setCurriculumAutoLevel,
  setCurriculumOverride,
} from "../prefs/prefsStore";
import type { CurriculumStateEntry, DspStatus, SessionType } from "../../domain/sessionTypes";

interface CurriculumSessionSummaryRow {
  session_type: string;
  overall_score: number;
  rate_score: number;
  volume_score: number;
  pitch_melody_score: number;
  tonality_score: number;
  pausing_score: number;
  content_coherence_score: number;
  content_coherence_notes: string;
  dsp_status: string | null;
  pitch_avg_hz: number | null;
  pitch_min_hz: number | null;
  pitch_max_hz: number | null;
  volume_stddev_dbfs: number | null;
}

// All eligible (status='done', non-script_practice) spontaneous sessions'
// curriculum signal, oldest first — a separate query from statsRepo.ts's
// getScoredSessionSummaries() so that Trends-chart consumer stays
// undisturbed. Deleted sessions are excluded — deleting a bad take
// removes it from your stats.
export async function getCurriculumSessionSummaries(): Promise<CurriculumSessionSignal[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CurriculumSessionSummaryRow>(
    `SELECT s.session_type, sc.overall_score, sc.rate_score, sc.volume_score, sc.pitch_melody_score,
            sc.tonality_score, sc.pausing_score, sc.content_coherence_score, sc.content_coherence_notes,
            s.dsp_status, s.pitch_avg_hz, s.pitch_min_hz, s.pitch_max_hz, s.volume_stddev_dbfs
     FROM sessions s
     JOIN scores sc ON sc.session_id = s.id
     WHERE s.status = 'done' AND s.deleted_at IS NULL AND s.session_type != 'script_practice'
     ORDER BY s.recorded_at ASC`,
  );
  return rows.map((row) => ({
    sessionType: row.session_type as SessionType,
    overallScore: row.overall_score,
    deliveryAvgScore:
      Math.round(
        ((row.rate_score + row.volume_score + row.pitch_melody_score + row.tonality_score + row.pausing_score) / 5) * 10,
      ) / 10,
    contentCoherenceScore: row.content_coherence_score,
    contentCoherenceNotes: row.content_coherence_notes,
    richDeliveryScore: computeRichDeliveryScore({
      dspStatus: row.dsp_status as DspStatus | null,
      pitchAvgHz: row.pitch_avg_hz,
      pitchMinHz: row.pitch_min_hz,
      pitchMaxHz: row.pitch_max_hz,
      volumeStddevDbfs: row.volume_stddev_dbfs,
    }),
  }));
}

export async function getCurrentCurriculumState(): Promise<CurriculumStateEntry | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<CurriculumStateRow>(`SELECT * FROM curriculum_state ORDER BY changed_at DESC LIMIT 1`);
  return row ? rowToCurriculumState(row) : null;
}

interface NewCurriculumStateChange {
  level: CurriculumLevel;
  direction: "up" | "down" | "initial";
  spontaneousComposite: number | null;
  drillComposite: number | null;
  spontaneousSessionCount: number;
  reasonCode: CurriculumComponent | "initial";
}

export async function insertCurriculumStateChange(input: NewCurriculumStateChange): Promise<void> {
  const db = await getDatabase();
  const changedAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO curriculum_state (changed_at, level, direction, spontaneous_composite, drill_composite, spontaneous_session_count, reason_code)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [changedAt, input.level, input.direction, input.spontaneousComposite, input.drillComposite, input.spontaneousSessionCount, input.reasonCode],
  );
}

export async function getCurriculumHistory(limit = 20): Promise<CurriculumStateEntry[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CurriculumStateRow>(`SELECT * FROM curriculum_state ORDER BY changed_at DESC LIMIT ?`, [limit]);
  return rows.map(rowToCurriculumState);
}

export interface CurriculumEvaluationResult extends CurriculumDecision {
  changed: boolean;
}

// THE single entry point that keeps the curriculum current: reads recent
// session/drill history, runs the pure evaluateCurriculum() decision, and —
// only on an actual level change — writes a new curriculum_state row.
// Always refreshes the cheap sync-readable cache (prefsStore's
// curriculumAutoLevel) regardless of whether an override is active, so the
// auto value stays current for whenever the override is cleared (see
// getEffectiveCurriculumLevel() below). Call this from a screen's focus
// effect (Home, Trends, Curriculum) — cheap enough to call on every focus,
// and idempotent when nothing has changed.
export async function recomputeCurriculumLevel(): Promise<CurriculumEvaluationResult> {
  const [currentState, sessions, recentDrills] = await Promise.all([
    getCurrentCurriculumState(),
    getCurriculumSessionSummaries(),
    getRecentDrillCompletions(50),
  ]);

  // First-ever run — lazily seed a baseline row at the default level so
  // future cooldown counting has a checkpoint to count new sessions from.
  if (!currentState) {
    const totalSpontaneous = sessions.filter((s) => s.sessionType !== "script_practice").length;
    await insertCurriculumStateChange({
      level: DEFAULT_CURRICULUM_LEVEL,
      direction: "initial",
      spontaneousComposite: null,
      drillComposite: null,
      spontaneousSessionCount: totalSpontaneous,
      reasonCode: "initial",
    });
    setCurriculumAutoLevel(DEFAULT_CURRICULUM_LEVEL);
    return {
      level: DEFAULT_CURRICULUM_LEVEL,
      direction: "initial",
      component: null,
      componentScore: null,
      reason: "changed",
      spontaneousComposite: null,
      drillComposite: null,
      spontaneousSessionCount: totalSpontaneous,
      changed: true,
    };
  }

  const decision = evaluateCurriculum({
    currentLevel: currentState.level as CurriculumLevel,
    spontaneousSessions: sessions,
    recentDrillsFirst: recentDrills.map((d) => ({ accuracyPercent: d.accuracyPercent })),
    spontaneousSessionCountAtLastChange: currentState.spontaneousSessionCount,
  });

  setCurriculumAutoLevel(decision.level);

  if (decision.level !== currentState.level && (decision.direction === "up" || decision.direction === "down")) {
    await insertCurriculumStateChange({
      level: decision.level,
      direction: decision.direction,
      spontaneousComposite: decision.spontaneousComposite,
      drillComposite: decision.drillComposite,
      spontaneousSessionCount: decision.spontaneousSessionCount,
      reasonCode: decision.component ?? "overall",
    });
    return { ...decision, changed: true };
  }

  return { ...decision, changed: false };
}

// Wipes curriculum_state entirely (current level AND its change history)
// and reseeds a single 'initial' row at DEFAULT_CURRICULUM_LEVEL — for when
// the level itself needs to go back to the start (e.g. DEFAULT_CURRICULUM_LEVEL
// changed, or someone just wants a clean slate), as opposed to
// recomputeCurriculumLevel()'s normal "only seed if nothing exists yet"
// behavior. The new checkpoint is today's *actual* total eligible session
// count, not 0 — so COOLDOWN_SESSIONS counts from now, and pre-existing
// practice history can't make the very next evaluation read as "6+ sessions
// since last change" and immediately move the level again. Also clears any
// manual override, since a stale pin at the old level would otherwise
// silently defeat the reset. Deliberately never touches `sessions` or
// `drill_completions` — this resets the curriculum *level*, not practice
// history or scores.
export async function resetCurriculumProgress(): Promise<void> {
  const db = await getDatabase();
  const sessions = await getCurriculumSessionSummaries();
  const totalSpontaneous = sessions.filter((s) => s.sessionType !== "script_practice").length;

  await db.runAsync("DELETE FROM curriculum_state");
  await insertCurriculumStateChange({
    level: DEFAULT_CURRICULUM_LEVEL,
    direction: "initial",
    spontaneousComposite: null,
    drillComposite: null,
    spontaneousSessionCount: totalSpontaneous,
    reasonCode: "initial",
  });

  setCurriculumOverride(null);
  setCurriculumAutoLevel(DEFAULT_CURRICULUM_LEVEL);
}

// Every consumer (prompt filter, drill default, recording duration,
// warm-up scaling) reads only this — guarantees a manual override is
// respected everywhere at once, never forgotten on one surface. Fully
// synchronous (two cheap MMKV reads) so it's safe to call from a
// component's render or a useState lazy initializer.
export function getEffectiveCurriculumLevel(): { level: CurriculumLevel; source: "manual" | "auto" } {
  const override = getCurriculumOverride();
  if (override !== null) return { level: override as CurriculumLevel, source: "manual" };
  return { level: getCurriculumAutoLevel() as CurriculumLevel, source: "auto" };
}
