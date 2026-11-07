import { getDatabase } from "../db/database";
import { getSkillStates, getStreakDates, getStreakState } from "../db/progressRepo";
import { getUserProfile } from "../prefs/prefsStore";
import { INITIAL_RATING, SKILLS } from "../../domain/mastery";
import { levelForScore, placementStage, type Stage } from "../../domain/levels";
import { getFirstAttempt, getSpeakerLevel } from "../db/leafRepo";
import { PILLAR_OF_SKILL } from "../../domain/scoring/skillTree";
import { EMPTY_JOURNEY, takeFacts, type JourneyFacts, type JourneySkill } from "../../domain/journey";
import { scorePointOf } from "../../domain/trends";
import type { TakeScores } from "../../domain/scoring/takeScore";
import { isoDateFromDate } from "../../utils/dateUtils";
import { logger } from "../../utils/logger";
import type { SkillId } from "../../theme/tokens";

// Gathers a person's journey (domain/journey.ts) from the phone's own records:
// the takes and drills, the streak, the skill check at the start and the
// stages now. Nothing leaves the phone. A part that can't be read is left
// empty rather than failing the whole finale.

async function readTakes(): Promise<{ sessionId: string; date: string; score: number | null }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; recorded_at: string; json: string | null }>(
    `SELECT s.id, s.recorded_at, a.json
     FROM sessions s LEFT JOIN session_artifacts a ON a.session_id = s.id AND a.kind = 'session_score'
     WHERE s.status = 'done' AND s.deleted_at IS NULL AND s.session_type NOT IN ('script_practice', 'feeling')
     ORDER BY s.recorded_at ASC`,
  );
  return rows.map((r) => {
    let score: number | null = null;
    try {
      // Delivery is on every take and uses one formula, so first and latest compare fairly.
      if (r.json) score = scorePointOf(r.recorded_at, JSON.parse(r.json) as TakeScores).delivery;
    } catch {
      score = null;
    }
    return { sessionId: r.id, date: isoDateFromDate(new Date(r.recorded_at)), score };
  });
}

export async function loadJourney(): Promise<JourneyFacts> {
  const facts: JourneyFacts = { ...EMPTY_JOURNEY };
  try {
    const db = await getDatabase();
    const [takes, totals, firstDrill, skills, streak, days] = await Promise.all([
      readTakes(),
      db.getFirstAsync<{ n: number; seconds: number | null }>(`SELECT COUNT(*) AS n, SUM(duration_seconds) AS seconds FROM sessions WHERE status = 'done' AND deleted_at IS NULL`),
      db.getFirstAsync<{ n: number; first: string | null }>(`SELECT COUNT(*) AS n, MIN(started_at) AS first FROM drill_attempts`),
      getSkillStates(),
      getStreakState(),
      getStreakDates(),
    ]);

    Object.assign(facts, takeFacts(takes));
    facts.takes = totals?.n ?? 0;
    facts.speakingMinutes = Math.round((totals?.seconds ?? 0) / 60);
    facts.drills = firstDrill?.n ?? 0;
    facts.longestStreak = streak.longestStreak;
    facts.practiceDays = new Set(days.map((d) => isoDateFromDate(new Date(d)))).size;

    const starts = [getUserProfile()?.startedAt, takes[0]?.date, firstDrill?.first ? isoDateFromDate(new Date(firstDrill.first)) : null].filter((d): d is string => !!d);
    facts.startedOn = starts.length ? starts.sort()[0] : null;

    // Where they started: where the placement left each pillar, so start and now
    // are the same kind of number. A placement sets only the leaves the check
    // touched, so a pillar starts below the check's own number. Without one,
    // everyone started at the first stage.
    const start = await getFirstAttempt();
    facts.skills = SKILLS.map((skill): JourneySkill => {
      const placed = start?.kind === "seed" ? start.nodes[PILLAR_OF_SKILL[skill]]?.[1] ?? null : null;
      const startRating = placed ?? INITIAL_RATING;
      const startStage: Stage = placed != null ? placementStage(placed) : 1;
      return { skill, startStage, nowStage: skills[skill].stage, startRating, nowRating: skills[skill].rating };
    });
    // The same for the level: where a placement left you, or where your first
    // attempt began.
    const overall = start?.nodes.overall;
    facts.speakerLevelStart = overall ? levelForScore(start.kind === "seed" ? overall[1] : overall[0]) : 1;
    facts.speakerLevelNow = await getSpeakerLevel();
  } catch (error) {
    logger.warn(`[journey] could not gather it all — ${(error as Error).message}`);
  }
  return facts;
}
