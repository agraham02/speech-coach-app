import type { SkillId } from "../theme/tokens";
import { stageProgress, type Stage } from "./levels";

// What one take changed, as a short sequence of "beats" the Result screen
// plays one after another: a stage earned, a personal best, the score
// against your last takes, the skills it moved, the streak or goal it kept,
// and where it leaves you on your path. At most four, most meaningful first.
// A drop is never shamed: one take is noise, so a dip is always set against
// the trend. Pure.

export interface SkillMove {
  skill: SkillId;
  ratingBefore: number;
  ratingAfter: number;
  stageBefore?: Stage;
  stageAfter?: Stage;
}

export interface MomentInput {
  score: number | null;
  // Overall scores of earlier takes, most recent first.
  previousScores: number[];
  // Best overall score of any earlier take.
  previousBest: number | null;
  moves: SkillMove[];
  speakerLevelBefore?: number;
  speakerLevelAfter?: number;
  // This take kept the streak going (the day's first practice).
  streakDays?: number | null;
  // Sessions done today against the daily goal, when the goal is above one.
  goal?: { done: number; goal: number } | null;
  // Where this take leaves you on the path (domain/path.ts).
  path?: { unitTitle: string; lessonIndex: number; lessonCount: number } | null;
}

export type Beat =
  | { kind: "stage"; skill: SkillId; stage: Stage; speakerLevel: number | null }
  | { kind: "best"; score: number; previousBest: number }
  | { kind: "score"; score: number; previous: number; direction: "up" | "down" | "same"; title: string; detail: string | null }
  | { kind: "skills"; moves: (SkillMove & { delta: number; progressBefore: number; progressAfter: number })[] }
  | { kind: "streak"; days: number }
  | { kind: "goal"; done: number; goal: number }
  | { kind: "path"; unitTitle: string; lessonIndex: number; lessonCount: number };

export const MAX_BEATS = 4;
const AVERAGE_OF = 5;
// Moves smaller than this don't earn a line.
const MIN_MOVE = 0.1;

const round1 = (x: number) => Math.round(x * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// The score against your last take, with the trend for context. With fewer
// than three earlier takes there's no average to speak of.
export function scoreLine(score: number, previousScores: number[]): Extract<Beat, { kind: "score" }> | null {
  if (previousScores.length === 0) return null;
  const previous = previousScores[0];
  const diff = round1(score - previous);
  const hasTrend = previousScores.length >= 3;
  const priorAvg = hasTrend ? round1(mean(previousScores.slice(0, AVERAGE_OF))) : null;
  const recentAvg = hasTrend ? round1(mean([score, ...previousScores.slice(0, AVERAGE_OF - 1)])) : null;
  if (diff > 0) {
    return {
      kind: "score",
      score,
      previous,
      direction: "up",
      title: `Up ${diff} on your last take`,
      detail: priorAvg != null && score > priorAvg ? `Above your recent average of ${priorAvg}.` : null,
    };
  }
  if (diff === 0) {
    return { kind: "score", score, previous, direction: "same", title: "Level with your last take", detail: null };
  }
  const detail =
    recentAvg != null && priorAvg != null
      ? recentAvg >= priorAvg
        ? `Your recent average is still up, at ${recentAvg}.`
        : `One take is noise. Your average over the last ${AVERAGE_OF} is ${priorAvg}.`
      : "One take is noise. The trend is what counts.";
  return { kind: "score", score, previous, direction: "down", title: `Down ${Math.abs(diff)} on your last take`, detail };
}

export function buildMoment(input: MomentInput): Beat[] {
  const beats: Beat[] = [];

  // 1. A stage earned — the biggest one, if a take earns two.
  const staged = input.moves
    .filter((m) => m.stageBefore != null && m.stageAfter != null && m.stageAfter > m.stageBefore)
    .sort((a, b) => b.stageAfter! - a.stageAfter!);
  if (staged[0]) {
    const leveled = input.speakerLevelAfter != null && input.speakerLevelBefore != null && input.speakerLevelAfter > input.speakerLevelBefore;
    beats.push({ kind: "stage", skill: staged[0].skill, stage: staged[0].stageAfter!, speakerLevel: leveled ? input.speakerLevelAfter! : null });
  }

  // 2. A personal best (only once there's something to beat).
  const best = input.score != null && input.previousBest != null && input.previousScores.length >= 2 && input.score > input.previousBest;
  if (best) beats.push({ kind: "best", score: input.score!, previousBest: input.previousBest! });

  // 3. The score against your last take — unless the best already said it.
  if (input.score != null && !best) {
    const line = scoreLine(input.score, input.previousScores);
    if (line) beats.push(line);
  }

  // 4. The skills it moved, biggest first.
  const moves = input.moves
    .map((m) => {
      const delta = round1(m.ratingAfter - m.ratingBefore);
      const stage = m.stageAfter ?? 1;
      // Crossing into a new stage starts its bar from empty.
      const crossed = m.stageBefore != null && m.stageAfter != null && m.stageAfter > m.stageBefore;
      return {
        ...m,
        delta,
        progressBefore: crossed ? 0 : stageProgress(m.ratingBefore, stage),
        progressAfter: stageProgress(m.ratingAfter, stage),
      };
    })
    .filter((m) => Math.abs(m.delta) >= MIN_MOVE)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);
  if (moves.length) beats.push({ kind: "skills", moves });

  // 5. The path, then the streak or the goal.
  if (input.path) beats.push({ kind: "path", ...input.path });
  if (input.streakDays && input.streakDays > 0) beats.push({ kind: "streak", days: input.streakDays });
  else if (input.goal && input.goal.goal > 1) beats.push({ kind: "goal", ...input.goal });

  return beats.slice(0, MAX_BEATS);
}
