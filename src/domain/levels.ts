import type { SkillId } from "../theme/tokens";
import { SKILLS } from "./mastery";

// The levels you can see. Each skill's 0-100 mastery rating (mastery.ts)
// falls into one of five named stages; your speaker level is built from all
// five, so every stage you earn in any skill is also a level-up. Stages are
// earned: once reached they stay, even if the rating dips — a dip shows as
// "a bit rusty", never as a demotion. Pure.

export type Stage = 1 | 2 | 3 | 4 | 5;

export const STAGE_NAMES: Record<Stage, string> = {
  1: "Foundations",
  2: "Building",
  3: "Steady",
  4: "Strong",
  5: "Polished",
};

// What each stage means, in one line — the same for every skill.
export const STAGE_MEANING: Record<Stage, string> = {
  1: "Learning what good sounds like.",
  2: "It shows up when you think about it.",
  3: "It holds up in most of your takes.",
  4: "It holds up on harder prompts, too.",
  5: "It's automatic — even under pressure.",
};

// The rating each stage starts at. Ratings settle near difficulty × 10 plus
// about 20-30 (the drill staircase keeps you succeeding ~82% of the time),
// so each stage is roughly two difficulty levels of real improvement. The
// skill check seeds 15-45, so nobody starts above Building.
export const STAGE_FLOORS: Record<Stage, number> = { 1: 0, 2: 35, 3: 48, 4: 62, 5: 80 };

// Scored attempts in a skill before its stage can be earned by practice.
// Early ratings swing by ±6 from one take to the next; without this a lucky
// first day would hand out a stage that means nothing.
export const STAGE_MIN_ATTEMPTS: Record<Stage, number> = { 1: 0, 2: 6, 3: 18, 4: 36, 5: 60 };

// How far below a stage's floor the rating can sink before it reads as
// rusty — a single off day shouldn't.
const RUSTY_MARGIN = 6;

export const MAX_STAGE: Stage = 5;
export const MAX_SPEAKER_LEVEL = SKILLS.length * (MAX_STAGE - 1) + 1;

export function stageForRating(rating: number): Stage {
  for (const stage of [5, 4, 3, 2] as Stage[]) if (rating >= STAGE_FLOORS[stage]) return stage;
  return 1;
}

// The stage after a new rating: never below the one already earned, and
// only as high as the practice behind it.
export function earnedStage(previous: Stage | null | undefined, rating: number, attempts: number): Stage {
  let reached = stageForRating(rating);
  while (reached > 1 && attempts < STAGE_MIN_ATTEMPTS[reached]) reached = (reached - 1) as Stage;
  return Math.max(previous ?? 1, reached) as Stage;
}

// Where the skill check places you: by rating alone, since there's no
// practice yet to gate it.
export function placementStage(rating: number): Stage {
  return stageForRating(rating);
}

// 0-1 toward the next stage from the current one; 1 at the top stage.
export function stageProgress(rating: number, stage: Stage): number {
  if (stage >= MAX_STAGE) return 1;
  const from = STAGE_FLOORS[stage];
  const to = STAGE_FLOORS[(stage + 1) as Stage];
  return Math.max(0, Math.min(1, (rating - from) / (to - from)));
}

// Rating points still needed for the next stage (0 at the top).
export function pointsToNextStage(rating: number, stage: Stage): number {
  if (stage >= MAX_STAGE) return 0;
  return Math.max(0, Math.ceil(STAGE_FLOORS[(stage + 1) as Stage] - rating));
}

export function isRusty(rating: number, stage: Stage): boolean {
  return stage > 1 && rating < STAGE_FLOORS[stage] - RUSTY_MARGIN;
}

// 1 when every skill is at Foundations, +1 for each stage earned anywhere.
export function speakerLevel(stages: Partial<Record<SkillId, Stage>>): number {
  return SKILLS.reduce((sum, s) => sum + ((stages[s] ?? 1) - 1), 0) + 1;
}

export function stageName(stage: Stage): string {
  return STAGE_NAMES[stage];
}

// Scored attempts still needed before the next stage can be earned.
export function attemptsToNextStage(attempts: number, stage: Stage): number {
  if (stage >= MAX_STAGE) return 0;
  return Math.max(0, STAGE_MIN_ATTEMPTS[(stage + 1) as Stage] - attempts);
}

// One line on what stands between you and the next stage.
export function nextStageHint(rating: number, attempts: number, stage: Stage): string {
  if (stage >= MAX_STAGE) return "Top stage. Keep it warm with practice.";
  const next = STAGE_NAMES[(stage + 1) as Stage];
  const points = pointsToNextStage(rating, stage);
  const more = attemptsToNextStage(attempts, stage);
  if (points > 0) return `${points} ${points === 1 ? "point" : "points"} to ${next}`;
  if (more > 0) return `Rating's there. ${more} more scored ${more === 1 ? "attempt" : "attempts"} to lock in ${next}`;
  return `${next} is next`;
}
